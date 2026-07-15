import { ZodError } from "zod";
import { getServerEnv } from "@/lib/config/env";
import { ConfigurationError, isAppError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  ActivityLogPage,
  BrowserManager,
  InvoiceTab,
  LayoutChangedError,
  PatientProfilePage,
  PatientsPage,
  PlaywrightBrowserDriver,
  SelectorRegistry,
  TreatmentTab,
  type BrowserDriver,
  type PatientRow,
  type RawInvoiceDetail,
} from "@/services/browser";
import type { CRMConnector } from "@/services/crm/crm-connector";
import {
  normalizedCrmPatientRecordSchema,
  type CRMHealth,
  type FindPatientsQuery,
  type FindPatientsResult,
  type NormalizedCrmPatientRecord,
  type PatientPage,
  type RetrievalWindow,
} from "@/services/crm/types";
import { buildNormalizedRecord, toPatientSummary } from "./normalizer";

/**
 * PlaywrightCRMConnector (ADR-033) — the first REAL CRMConnector, driving
 * the CRM's web UI through the BrowserDriver seam. The CRMConnector contract
 * is byte-identical to the mock's (ADR-027): normalized records out,
 * business outcomes as data (never auto-picked), READ-ONLY against the
 * source system, every record stamped with provenance.
 *
 * Credentials come exclusively from CRM_URL / CRM_USERNAME / CRM_PASSWORD
 * (validated on first use). One connector = one browser session, logged in
 * once and reused across calls; expiry recovers via one reconnect
 * (CRM_DISCOVERY §5).
 *
 * Search reality (v1 captures): the CRM's /clients filter accepts NAME and
 * MOBILE server-side. crmId resolves by direct profile navigation; email
 * refines results client-side; a dob-only query cannot be satisfied by the
 * live CRM and returns not-found (logged) — the one documented divergence
 * from the mock.
 */

export interface PlaywrightConnectorDeps {
  /** Injectable for tests — MockBrowserDriver exercises every code path. */
  driver?: BrowserDriver;
  registry?: SelectorRegistry;
  config?: { url: string; username: string; password: string; headless?: boolean };
  /** Result pages fetched per search before declaring ambiguity. */
  maxSearchPages?: number;
  /** Activity-log pages read per retrieval — never a full scan. */
  maxActivityPages?: number;
  /** Upper bound on enumeration page depth reachable in one sweep (ADR-037). */
  maxEnumerationPages?: number;
}

const DEFAULT_MAX_SEARCH_PAGES = 3;
const DEFAULT_MAX_ACTIVITY_PAGES = 5;
const DEFAULT_MAX_ENUMERATION_PAGES = 200;

export class PlaywrightCRMConnector implements CRMConnector {
  readonly kind = "browser-automation" as const;

  private manager: BrowserManager | null = null;
  private readonly maxSearchPages: number;
  private readonly maxActivityPages: number;
  private readonly maxEnumerationPages: number;

  constructor(private readonly deps: PlaywrightConnectorDeps = {}) {
    this.maxSearchPages = deps.maxSearchPages ?? DEFAULT_MAX_SEARCH_PAGES;
    this.maxActivityPages = deps.maxActivityPages ?? DEFAULT_MAX_ACTIVITY_PAGES;
    this.maxEnumerationPages = deps.maxEnumerationPages ?? DEFAULT_MAX_ENUMERATION_PAGES;
  }

  async healthCheck(): Promise<CRMHealth> {
    try {
      const manager = this.getManager();
      const health = await manager.session.healthCheck();
      return { ok: health.ok, detail: health.detail, checkedAt: new Date() };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  }

  async findPatients(query: FindPatientsQuery): Promise<FindPatientsResult> {
    const hasCriteria = Boolean(
      query.crmId ||
      query.name ||
      query.firstName ||
      query.lastName ||
      query.dob ||
      query.mobileNo ||
      query.email
    );
    if (!hasCriteria) return { outcome: "not-found", candidates: [] };

    const manager = this.getManager();
    await manager.session.ensureAuthenticated();

    if (query.crmId) return this.findByCrmId(manager, query.crmId);

    const searchTerm = this.searchTerm(query);
    if (!searchTerm && !query.mobileNo) {
      // The live CRM cannot search by dob/email alone (CRM_DISCOVERY §1).
      logger.warn("CRM search skipped: no live-searchable criteria", {
        hasDob: Boolean(query.dob),
        hasEmail: Boolean(query.email),
      });
      return { outcome: "not-found", candidates: [] };
    }

    const page = (await manager.navigation.navigateTo("patient-search")) as PatientsPage;
    let rows = await page.search({ name: searchTerm ?? "", mobile: query.mobileNo ?? "" });
    for (let extra = 1; extra < this.maxSearchPages && (await page.hasNextPage()); extra++) {
      rows = rows.concat(await page.nextPage());
    }

    const refined = this.refine(rows, query);
    if (refined.length === 0) return { outcome: "not-found", candidates: [] };
    if (refined.length === 1) {
      return { outcome: "found", candidates: [toPatientSummary(refined[0]!)] };
    }
    // Never auto-pick between candidates (CRM_DISCOVERY §6).
    return { outcome: "ambiguous", candidates: refined.map(toPatientSummary) };
  }

  /**
   * Read-only enumeration of the unfiltered /clients list, one page at a time
   * (ADR-037). Stateless across calls: reaching page N re-navigates to the
   * list and advances N-1 times (the CRM's DataTable pagination is a UI
   * control, not a URL param we can trust), bounded by `maxEnumerationPages`.
   * Live-only — the mock CONNECTOR enumerates fixtures directly; there is no
   * multi-page /clients capture to replay.
   */
  async listPatients(page: number): Promise<PatientPage> {
    if (page < 1) throw new Error("listPatients: page is 1-based (got " + page + ")");
    if (page > this.maxEnumerationPages) {
      throw new LayoutChangedError(
        `listPatients: page ${page} exceeds the enumeration bound ${this.maxEnumerationPages} ` +
          `— refuse to crawl unboundedly; narrow the sweep or raise maxEnumerationPages.`
      );
    }

    const manager = this.getManager();
    await manager.session.ensureAuthenticated();

    const listPage = (await manager.navigation.navigateTo("patient-search")) as PatientsPage;
    let rows = await listPage.readResults();
    let hasNext = await listPage.hasNextPage();

    for (let current = 1; current < page; current++) {
      if (!hasNext) return { patients: [], page, hasNextPage: false };
      rows = await listPage.nextPage();
      hasNext = await listPage.hasNextPage();
    }

    return { patients: rows.map(toPatientSummary), page, hasNextPage: hasNext };
  }

  async fetchPatientRecord(
    crmId: string,
    window?: RetrievalWindow
  ): Promise<NormalizedCrmPatientRecord> {
    const manager = this.getManager();
    await manager.session.ensureAuthenticated();

    const profile = await this.openProfile(manager, crmId);
    const { fullName } = await profile.readPatientCard();
    const demographics = await profile.readDemographics();
    const locked = await profile.isTreatmentLocked();

    await profile.openTab("treatment-records");
    const packages = await new TreatmentTab(manager.driver, manager.registry).read();

    await profile.openTab("invoice");
    const invoiceTab = new InvoiceTab(manager.driver, manager.registry);
    const invoices = await invoiceTab.readInvoices();
    // Invoice detail (services + full payment history) is READ-ONLY from each
    // row's embedded base64 `data-details` attribute — no click, no navigation
    // (M0056). Gated on the capability so it can be turned off without code
    // changes; when off, payments stay null (never guessed).
    const invoiceDetails = manager.registry.capability("invoiceDetail")
      ? await invoiceTab.readInvoiceDetails()
      : new Map<string, RawInvoiceDetail>();

    const activityPage = (await manager.navigation.navigateTo("activity-log")) as ActivityLogPage;
    const activity = await activityPage.readFiltered(
      {
        from: window ? `${window.from}T00:00` : "",
        to: window ? `${window.to}T23:59` : "",
        keyword: fullName,
      },
      this.maxActivityPages
    );

    const record = buildNormalizedRecord(
      {
        crmId,
        fullName: fullName || this.composeName(demographics),
        demographics,
        locked,
        packages,
        invoices,
        invoiceDetails,
        activity,
      },
      window,
      { selectorVersion: manager.registry.version }
    );

    // Boundary guarantee: connectors emit only schema-valid records.
    try {
      return normalizedCrmPatientRecordSchema.parse(record);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new LayoutChangedError(
          `Scraped record for /clients/${crmId} failed schema validation: ` +
            error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
          { cause: error }
        );
      }
      throw error;
    }
  }

  /** Dispose the browser session (playgrounds and tests). */
  async dispose(): Promise<void> {
    await this.manager?.dispose();
    this.manager = null;
  }

  // ---- internals ----------------------------------------------------------

  private getManager(): BrowserManager {
    if (this.manager) return this.manager;

    const config = this.deps.config ?? this.configFromEnv();
    const driver =
      this.deps.driver ??
      new PlaywrightBrowserDriver({
        baseUrl: config.url,
        headless: config.headless ?? true,
      });

    this.manager = new BrowserManager(
      driver,
      { username: config.username, password: config.password },
      this.deps.registry ?? new SelectorRegistry()
    );
    return this.manager;
  }

  private configFromEnv(): { url: string; username: string; password: string; headless: boolean } {
    const env = getServerEnv();
    const missing = [
      !env.CRM_URL && "CRM_URL",
      !env.CRM_USERNAME && "CRM_USERNAME",
      !env.CRM_PASSWORD && "CRM_PASSWORD",
    ].filter((name): name is string => typeof name === "string");
    if (missing.length > 0) {
      throw new ConfigurationError(
        `The browser-automation CRM connector needs ${missing.join(", ")} (see .env.example).`
      );
    }
    return {
      url: env.CRM_URL as string,
      username: env.CRM_USERNAME as string,
      password: env.CRM_PASSWORD as string,
      headless: env.CRM_BROWSER_HEADLESS !== "false",
    };
  }

  private async findByCrmId(manager: BrowserManager, crmId: string): Promise<FindPatientsResult> {
    let profile: PatientProfilePage;
    try {
      profile = await this.openProfile(manager, crmId);
    } catch (error) {
      if (error instanceof NotFoundError) return { outcome: "not-found", candidates: [] };
      throw error;
    }
    const { fullName } = await profile.readPatientCard();
    const demographics = await profile.readDemographics();
    return {
      outcome: "found",
      candidates: [
        {
          crmId,
          fullName: fullName || this.composeName(demographics),
          dateOfBirth: demographics.dateOfBirth,
          mobileNo: demographics.mobileNo,
          membershipType: null,
          lastVisit: null,
        },
      ],
    };
  }

  /**
   * Open /clients/{cid} through navigate→verify→recover. A fingerprint
   * failure on an explicit cid is reported as NOT_FOUND (mock parity for
   * unknown patients) and logged loudly — if profiles drift wholesale, the
   * log trail and healthCheck expose it.
   */
  private async openProfile(manager: BrowserManager, crmId: string): Promise<PatientProfilePage> {
    try {
      return (await manager.navigation.navigateTo("patient-profile", {
        cid: crmId,
      })) as PatientProfilePage;
    } catch (error) {
      if (isAppError(error) && error.code === "CRM_LAYOUT") {
        logger.warn("Patient profile fingerprint failed — treating as unknown cid", {
          crmId,
          detail: error.message,
        });
        throw new NotFoundError("CRM patient");
      }
      throw error;
    }
  }

  private searchTerm(query: FindPatientsQuery): string | null {
    if (query.name) return query.name;
    if (query.lastName && query.firstName) return `${query.lastName}, ${query.firstName}`;
    return query.lastName ?? query.firstName ?? null;
  }

  /** Client-side refinement for criteria the live form does not offer. */
  private refine(rows: PatientRow[], query: FindPatientsQuery): PatientRow[] {
    const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
    const digits = (value: string) => value.replace(/\D/g, "");
    return rows.filter((row) => {
      if (query.email && norm(row.email ?? "") !== norm(query.email)) return false;
      if (query.mobileNo && digits(row.mobileNo ?? "") !== digits(query.mobileNo)) return false;
      if (query.firstName && !norm(row.fullName).includes(norm(query.firstName))) return false;
      if (query.lastName && !norm(row.fullName).includes(norm(query.lastName))) return false;
      return true;
    });
  }

  private composeName(demographics: { firstName: string | null; lastName: string | null }): string {
    return [demographics.lastName, demographics.firstName].filter(Boolean).join(", ");
  }
}
