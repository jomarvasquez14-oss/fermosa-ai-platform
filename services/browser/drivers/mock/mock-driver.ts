import type {
  BrowserDriver,
  BrowserLocator,
  DownloadResult,
  TableCell,
  TableData,
  WaitForOptions,
} from "@/services/browser/driver/browser-driver";
import { NEUTRALIZE_ANNOUNCEMENTS_EXPRESSION } from "@/services/browser/pages/interstitials";
import { SELECTOR_MAP_V1 } from "@/services/browser/selectors";
import { browserError, LayoutChangedError } from "@/services/browser/types";

/**
 * MockBrowserDriver (ADR-031/033) — an in-memory simulation of the CRM,
 * aligned with the v1 selector map so page fingerprints pass. It ships a
 * small fictional patient set (mirroring the mock connector's scenarios) so
 * page objects, the Playwright CRM connector, and /dev/browser all exercise
 * REAL parsing paths without live access. Scriptable failure modes:
 *
 *   expireSession()        next authenticated page shows the login form
 *   failNextNavigations(n) network failures (CRM_UNAVAILABLE) for n gotos
 *   showCaptcha(bool)      login page grows a CAPTCHA
 *   showAnnouncement(bool) dashboard raises the announcement interstitial
 *   breakLayout(path)      remove a page's fingerprint elements
 *   setTable/setTables/setText/setLocator/setEvaluate  scripted overrides
 *   reset()                back to a healthy logged-out CRM
 */

// ---------------------------------------------------------------------------
// TableData builders (also exported for tests)
// ---------------------------------------------------------------------------

export function textCell(text: string, links: TableCell["links"] = []): TableCell {
  return { text, value: null, selectedLabel: null, links };
}

export function inputCell(value: string): TableCell {
  return { text: "", value, selectedLabel: null, links: [] };
}

export function selectCell(value: string, label: string): TableCell {
  return { text: label, value, selectedLabel: label, links: [] };
}

// ---------------------------------------------------------------------------
// Built-in demo CRM content (entirely fictional)
// ---------------------------------------------------------------------------

interface MockPatientProfile {
  cid: string;
  fullName: string;
  email: string;
  mobile: string;
  membershipType: string;
  lastVisit: string;
  demographics: {
    first: string;
    middle: string;
    last: string;
    nickname: string;
    dob: string;
  };
  packages: Array<{
    title: string;
    rows: Array<{
      date: string;
      branchId: string;
      branchName: string;
      promo: string;
      procedure: string;
      intensity: string;
      user: string;
    }>;
  }>;
  invoices: Array<{
    refNo: string;
    serviceName: string;
    amount: string;
    amountPaid: string;
    balance: string;
    dateUpdated: string;
    status: string;
  }>;
  activity: Array<{
    logName: string;
    description: string;
    causedBy: string;
    date: string;
    details: Record<string, string>;
    oldDetails: Record<string, string>;
  }>;
}

const DEMO_PATIENTS: readonly MockPatientProfile[] = [
  {
    cid: "1001",
    fullName: "Santos, Maria",
    email: "maria.santos@example.test",
    mobile: "09171001000",
    membershipType: "MEMBER",
    lastVisit: "2026-07-10",
    demographics: {
      first: "Maria",
      middle: "D",
      last: "Santos",
      nickname: "Mia",
      dob: "1992-03-14 00:00:00",
    },
    packages: [
      {
        title: "GLUTA DRIP 10 SESSION (2/10) completed",
        rows: [
          {
            date: "2026-07-03",
            branchId: "1",
            branchName: "Fermosa - Trece Martires",
            promo: "",
            procedure: "GLUTA DRIP",
            intensity: "",
            user: "02 Shiela Layam",
          },
          {
            date: "2026-07-10",
            branchId: "1",
            branchName: "Fermosa - Trece Martires",
            promo: "PROMO10",
            procedure: "GLUTA DRIP",
            intensity: "Level 2",
            user: "01 Dyan Montinola",
          },
        ],
      },
    ],
    invoices: [
      {
        refNo: "007-162320",
        serviceName: "GLUTA DRIP 10 SESSION",
        amount: "15,999.00",
        amountPaid: "14,000.00",
        balance: "1,999.00",
        dateUpdated: "2026-07-10",
        status: "PARTIALLY PAID",
      },
    ],
    activity: [
      {
        logName: "payments",
        description: "Payments has been created",
        causedBy: "Fermosa Trece",
        date: "2026-07-10 18:32:52",
        details: {
          "service.name": "GLUTA DRIP 10 SESSION",
          amount_paid: "2500",
          invoice_id: "162320",
        },
        oldDetails: {},
      },
    ],
  },
  {
    cid: "1004",
    fullName: "Cruz, Catherine",
    email: "catherine.a@example.test",
    mobile: "09171004000",
    membershipType: "REGULAR",
    lastVisit: "2026-06-01",
    demographics: {
      first: "Catherine",
      middle: "",
      last: "Cruz",
      nickname: "",
      dob: "1990-01-20 00:00:00",
    },
    packages: [],
    invoices: [],
    activity: [],
  },
  {
    cid: "1005",
    fullName: "Cruz, Catherine",
    email: "catherine.b@example.test",
    mobile: "09171005000",
    membershipType: "MEMBER",
    lastVisit: "2026-05-15",
    demographics: {
      first: "Catherine",
      middle: "",
      last: "Cruz",
      nickname: "Cathy",
      dob: "1988-11-02 00:00:00",
    },
    packages: [],
    invoices: [],
    activity: [],
  },
];

const PATIENT_LIST_HEADERS = [
  "",
  "NAME",
  "EMAIL",
  "MOBILE",
  "TYPE",
  "LAST VISIT",
  "CREATED AT",
  "ACTIONS",
];
const INVOICE_HEADERS = [
  "REF NO",
  "CLIENT NAME",
  "CONTACT NO.",
  "SERVICE NAME",
  "AMOUNT",
  "AMOUNT PAID",
  "BALANCE",
  "DATE UPDATED",
  "STATUS",
  "BRANCH",
];
const ACTIVITY_HEADERS = [
  "View Details",
  "#",
  "Log Name",
  "Description",
  "Caused By",
  "Date",
  "Details",
  "Old Details",
];
const TREATMENT_HEADERS = [
  "DATE",
  "BRANCH",
  "PROMO CODE",
  "PROCEDURE",
  "INTENSITY SETTINGS",
  "USER",
];

/** Tab panes on the profile page (Bootstrap ids, visible once activated). */
const PROFILE_TAB_PANES = ["#treatment-records", "#client-profile", "#appointments", "#invoice"];

const V1 = SELECTOR_MAP_V1.pages;

export class MockBrowserDriver implements BrowserDriver {
  private url = "about:blank";
  private launched = false;
  private authenticated = false;
  private expired = false;
  private captcha = false;
  private announcement = false;
  private activityFiltersCollapsed = false;
  private failNavigations = 0;
  private brokenPaths = new Set<string>();
  private readonly formValues = new Map<string, string>();
  private readonly historyStack: string[] = [];

  private readonly scriptedTables = new Map<string, TableData[]>();
  private readonly scriptedTexts = new Map<string, string>();
  private readonly scriptedLocators = new Map<
    string,
    { texts?: string[]; values?: (string | null)[]; attrs?: Record<string, (string | null)[]> }
  >();
  private readonly scriptedEvaluations = new Map<string, unknown>();

  // ---- scripting API (dev playground + tests) ----
  expireSession(): void {
    this.expired = true;
  }
  failNextNavigations(count: number): void {
    this.failNavigations = count;
  }
  showCaptcha(enabled: boolean): void {
    this.captcha = enabled;
  }
  showAnnouncement(enabled: boolean): void {
    this.announcement = enabled;
  }
  /** Simulate the live /activity-logs Filters panel arriving collapsed (M0049). */
  collapseActivityFilters(enabled: boolean): void {
    this.activityFiltersCollapsed = enabled;
  }
  breakLayout(path: string): void {
    this.brokenPaths.add(path);
  }
  setTable(selector: string, data: TableData): void {
    this.scriptedTables.set(selector, [data]);
  }
  setTables(selector: string, data: TableData[]): void {
    this.scriptedTables.set(selector, data);
  }
  setText(selector: string, text: string): void {
    this.scriptedTexts.set(selector, text);
  }
  setLocator(
    selector: string,
    result: {
      texts?: string[];
      values?: (string | null)[];
      attrs?: Record<string, (string | null)[]>;
    }
  ): void {
    this.scriptedLocators.set(selector, result);
  }
  setEvaluate(script: string, result: unknown): void {
    this.scriptedEvaluations.set(script, result);
  }
  reset(): void {
    this.url = "about:blank";
    this.launched = false;
    this.authenticated = false;
    this.expired = false;
    this.captcha = false;
    this.announcement = false;
    this.activityFiltersCollapsed = false;
    this.failNavigations = 0;
    this.brokenPaths.clear();
    this.formValues.clear();
    this.historyStack.length = 0;
    this.scriptedTables.clear();
    this.scriptedTexts.clear();
    this.scriptedLocators.clear();
    this.scriptedEvaluations.clear();
  }
  get state() {
    return {
      url: this.url,
      authenticated: this.authenticated && !this.expired,
      expired: this.expired,
      captcha: this.captcha,
      pendingNetworkFailures: this.failNavigations,
      brokenPaths: [...this.brokenPaths],
    };
  }

  // ---- BrowserDriver: lifecycle ----
  async launch(): Promise<void> {
    this.launched = true;
  }

  async close(): Promise<void> {
    this.reset();
  }

  // ---- BrowserDriver: navigation ----
  async goto(url: string): Promise<void> {
    this.launched = true;
    if (this.failNavigations > 0) {
      this.failNavigations--;
      throw browserError("CRM_UNAVAILABLE", `Simulated network failure reaching ${url}.`);
    }
    this.historyStack.push(this.url);
    this.url = url;
  }

  async goBack(): Promise<void> {
    const previous = this.historyStack.pop();
    if (previous) this.url = previous;
  }

  async reload(): Promise<void> {
    // Server-rendered pages: reload keeps state.
  }

  async currentUrl(): Promise<string> {
    return this.url;
  }

  // ---- BrowserDriver: element actions ----
  async fill(selector: string, value: string): Promise<void> {
    // Playwright parity: fill auto-waits for an actionable (visible) target
    // and times out on hidden inputs — e.g. inside a collapsed panel (M0049).
    if (!this.isScripted(selector) && !(await this.isVisible(selector))) {
      throw browserError(
        "CRM_TIMEOUT",
        `fill(${selector}) target not visible on ${this.effectivePath()}.`
      );
    }
    this.formValues.set(selector, value);
  }

  async select(selector: string, value: string): Promise<void> {
    this.formValues.set(selector, value);
  }

  async click(selector: string): Promise<void> {
    const login = V1.login.elements;
    const dashboard = V1.dashboard.elements;

    if (selector === login.submit && this.effectivePath() === "/login") {
      const username = this.formValues.get(login.username ?? "");
      const password = this.formValues.get(login.password ?? "");
      if (username && password) {
        this.authenticated = true;
        this.expired = false;
        this.url = "/";
      }
      return;
    }
    if (selector === dashboard.logoutButton) {
      this.authenticated = false;
      this.expired = false;
      this.url = "/login";
      return;
    }
    if (selector === V1["patient-search"].elements.resetLink) {
      this.formValues.delete(V1["patient-search"].elements.nameInput ?? "");
      this.formValues.delete(V1["patient-search"].elements.mobileInput ?? "");
    }
    if (selector === V1["activity-log"].elements.filtersToggle) {
      // Client-side panel-collapse toggle — flips visibility, nothing else.
      this.activityFiltersCollapsed = !this.activityFiltersCollapsed;
      return;
    }
    // Tab clicks, submits of GET filter forms, pagination: state is already
    // derived from formValues/url, so a click is a no-op here.
  }

  async waitFor(selector: string, options?: WaitForOptions): Promise<void> {
    const state = options?.state ?? "visible";
    const present = (await this.isVisible(selector)) || this.isScripted(selector);
    if (state === "hidden" ? present : !present) {
      throw browserError(
        "CRM_TIMEOUT",
        `waitFor(${selector}, ${state}) did not resolve on ${this.effectivePath()}.`
      );
    }
  }

  // ---- BrowserDriver: observation ----
  async text(selector: string): Promise<string> {
    const scripted = this.scriptedTexts.get(selector);
    if (scripted !== undefined) return scripted;
    const legacy = await this.readText(selector);
    if (legacy !== null) return legacy;
    throw new LayoutChangedError(`MockBrowserDriver: no text for "${selector}".`);
  }

  async readText(selector: string): Promise<string | null> {
    const scripted = this.scriptedTexts.get(selector);
    if (scripted !== undefined) return scripted;
    if (selector === V1["patient-profile"].elements.profileCard) {
      const patient = this.currentPatient();
      if (patient) return `${patient.fullName}\n${patient.email}\n${patient.mobile}`;
    }
    return null;
  }

  async isVisible(selector: string): Promise<boolean> {
    const path = this.effectivePath();
    if (this.brokenPaths.has(path)) return false;
    if (this.isScripted(selector)) return true;

    // Unknown cid = the CRM's 404 page: no profile fingerprint matches.
    if (path === "/clients/{cid}" && !this.currentPatient()) return false;

    // Profile tab panes act visible once the profile page is open.
    if (path === "/clients/{cid}" && PROFILE_TAB_PANES.some((pane) => selector.startsWith(pane))) {
      return true;
    }

    const entries = Object.values(V1).filter((page) => page.path.split("#")[0] === path);
    const owner = entries.find(
      (page) =>
        page.fingerprint.includes(selector) || Object.values(page.elements).includes(selector)
    );
    if (!owner) return false;

    if (selector === V1.login.elements.captcha) return this.captcha;
    if (selector === V1.dashboard.elements.userChrome) return this.authenticated && !this.expired;
    if (
      selector === V1.dashboard.elements.announcementModals ||
      selector === V1.dashboard.elements.instantAnnouncementModal ||
      selector === V1.dashboard.elements.checklistAnnouncementModal
    ) {
      return this.announcement;
    }
    // Single-page demo data: no next-page link exists.
    if (
      selector === V1["patient-search"].elements.paginationNext ||
      selector === V1["activity-log"].elements.paginationNext
    ) {
      return false;
    }
    // Collapsed Filters panel: inputs exist but are not visible (M0049).
    // Path-scoped because "input[name=search]" doubles as the patients page's
    // name filter — the collapse must never leak onto other pages.
    if (
      this.activityFiltersCollapsed &&
      path === V1["activity-log"].path &&
      (selector === V1["activity-log"].elements.fromInput ||
        selector === V1["activity-log"].elements.toInput ||
        selector === V1["activity-log"].elements.keywordInput)
    ) {
      return false;
    }
    return true;
  }

  locator(selector: string): BrowserLocator {
    return {
      count: async () => this.locatorData(selector).texts.length,
      texts: async () => this.locatorData(selector).texts,
      values: async () => this.locatorData(selector).values,
      attrs: async (name: string) => this.locatorData(selector).attrs[name] ?? [],
    };
  }

  async table(selector: string): Promise<TableData> {
    const tables = await this.tables(selector);
    const first = tables[0];
    if (!first) {
      throw new LayoutChangedError(
        `MockBrowserDriver: no table for "${selector}" on ${this.effectivePath()}.`
      );
    }
    return first;
  }

  async tables(selector: string): Promise<TableData[]> {
    const scripted = this.scriptedTables.get(selector);
    if (scripted) return scripted;
    const builtIn = this.builtInTables(selector);
    if (builtIn) return builtIn;
    return [];
  }

  async screenshot(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async download(selector: string): Promise<DownloadResult> {
    return {
      path: `mock://download/${encodeURIComponent(selector)}`,
      suggestedFilename: "mock.pdf",
    };
  }

  async evaluate<T>(script: string): Promise<T> {
    if (this.scriptedEvaluations.has(script)) {
      return this.scriptedEvaluations.get(script) as T;
    }
    // Announcement neutralization (M0042A): simulate the client-side node
    // removal — the modal disappears without any mark-as-read "click".
    if (script === NEUTRALIZE_ANNOUNCEMENTS_EXPRESSION) {
      const removed = this.announcement ? 1 : 0;
      this.announcement = false;
      return removed as T;
    }
    throw new Error(`MockBrowserDriver.evaluate: no scripted result for "${script}".`);
  }

  // ---- internals ----

  /** Expired sessions render the login page regardless of the requested URL. */
  private effectivePath(): string {
    if (this.url === "about:blank") return "about:blank";
    if (this.expired) return "/login";
    if (!this.authenticated && this.url !== "/login") return "/login";
    const base = this.url.split("?")[0] ?? this.url;
    if (base.startsWith("/clients/")) return "/clients/{cid}";
    return base;
  }

  private isScripted(selector: string): boolean {
    return (
      this.scriptedTables.has(selector) ||
      this.scriptedTexts.has(selector) ||
      this.scriptedLocators.has(selector)
    );
  }

  private currentPatient(): MockPatientProfile | null {
    const cid = this.url.match(/\/clients\/(\d+)/)?.[1];
    if (!cid) return null;
    return DEMO_PATIENTS.find((patient) => patient.cid === cid) ?? null;
  }

  private locatorData(selector: string): {
    texts: string[];
    values: (string | null)[];
    attrs: Record<string, (string | null)[]>;
  } {
    const scripted = this.scriptedLocators.get(selector);
    if (scripted) {
      return {
        texts: scripted.texts ?? [],
        values: scripted.values ?? [],
        attrs: scripted.attrs ?? {},
      };
    }

    const profile = V1["patient-profile"].elements;
    const patient = this.currentPatient();
    if (patient && this.effectivePath() === "/clients/{cid}") {
      if (selector === V1["treatment-tab"].elements.panelTitles) {
        return { texts: patient.packages.map((pkg) => pkg.title), values: [], attrs: {} };
      }
      if (selector === profile.lockLink) {
        return { texts: ["Lock Records"], values: [], attrs: {} };
      }
      const demographicValue = this.demographicValue(selector, patient);
      if (demographicValue !== undefined) {
        return { texts: [], values: [demographicValue], attrs: {} };
      }
    }

    // Unknown locator: empty result (count 0) — pagination checks rely on it.
    return { texts: [], values: [], attrs: {} };
  }

  private demographicValue(selector: string, patient: MockPatientProfile): string | undefined {
    const p = V1["patient-profile"].elements;
    const d = patient.demographics;
    switch (selector) {
      case p.firstNameInput:
        return d.first;
      case p.middleNameInput:
        return d.middle;
      case p.lastNameInput:
        return d.last;
      case p.nicknameInput:
        return d.nickname;
      case p.emailInput:
        return patient.email;
      case p.mobileInput:
        return patient.mobile;
      case p.dobInput:
        return d.dob;
      default:
        return undefined;
    }
  }

  private builtInTables(selector: string): TableData[] | null {
    const path = this.effectivePath();
    const search = V1["patient-search"].elements;
    const invoiceTab = V1["invoice-tab"].elements;
    const activity = V1["activity-log"].elements;

    if (selector === search.resultsTable && path === "/clients") {
      return [this.patientListTable()];
    }

    const patient = this.currentPatient();
    if (patient && path === "/clients/{cid}") {
      if (selector === invoiceTab.table) return [this.invoiceTable(patient)];
      const panelMatch = selector.match(/\.panel:nth-child\((\d+)\) table$/);
      if (panelMatch && selector.startsWith("#treatment-records")) {
        const pkg = patient.packages[Number.parseInt(panelMatch[1] ?? "0", 10) - 1];
        return pkg ? [this.treatmentTable(pkg)] : [];
      }
    }

    if (path === "/activity-logs") {
      const entries = this.filteredActivity();
      if (selector === activity.table) return [this.activityTable(entries)];
      const nested = selector.match(/tr:nth-child\((\d+)\) td:nth-child\((\d+)\) table$/);
      if (nested) {
        const entry = entries[Number.parseInt(nested[1] ?? "0", 10) - 1];
        if (!entry) return [];
        const diff = nested[2] === "7" ? entry.details : entry.oldDetails;
        const rows = Object.entries(diff).map(([field, value]) => [
          textCell(field),
          textCell(value),
        ]);
        return rows.length > 0 ? [{ headers: [], rows }] : [];
      }
    }

    return null;
  }

  /** GET-filter semantics: name substring + mobile digits, like the live CRM. */
  private patientListTable(): TableData {
    const search = V1["patient-search"].elements;
    const name = (this.formValues.get(search.nameInput ?? "") ?? "").trim().toLowerCase();
    const mobile = (this.formValues.get(search.mobileInput ?? "") ?? "").replace(/\D/g, "");

    const matches = DEMO_PATIENTS.filter((patient) => {
      if (name && !patient.fullName.toLowerCase().includes(name)) return false;
      if (mobile && !patient.mobile.replace(/\D/g, "").includes(mobile)) return false;
      return true;
    });

    if (matches.length === 0) {
      return {
        headers: PATIENT_LIST_HEADERS,
        rows: [[textCell("No data available in table")]],
      };
    }

    return {
      headers: PATIENT_LIST_HEADERS,
      rows: matches.map((patient, index) => [
        textCell(`${index + 1}.`),
        textCell(patient.fullName),
        textCell(patient.email),
        textCell(patient.mobile),
        textCell(patient.membershipType),
        textCell(patient.lastVisit),
        textCell("1 year ago"),
        textCell("", [
          {
            href: `https://crm.example.test/clients/${patient.cid}?cid=${patient.cid}`,
            title: "View client",
            text: "",
          },
        ]),
      ]),
    };
  }

  private treatmentTable(pkg: MockPatientProfile["packages"][number]): TableData {
    return {
      headers: TREATMENT_HEADERS,
      rows: pkg.rows.map((row) => [
        inputCell(row.date),
        selectCell(row.branchId, row.branchName),
        inputCell(row.promo),
        inputCell(row.procedure),
        inputCell(row.intensity),
        selectCell("7", row.user),
      ]),
    };
  }

  private invoiceTable(patient: MockPatientProfile): TableData {
    if (patient.invoices.length === 0) {
      return { headers: INVOICE_HEADERS, rows: [[textCell("No data available in table")]] };
    }
    return {
      headers: INVOICE_HEADERS,
      rows: patient.invoices.map((invoice) => [
        textCell(invoice.refNo),
        textCell(patient.fullName),
        textCell(patient.mobile),
        textCell(invoice.serviceName),
        textCell(invoice.amount),
        textCell(invoice.amountPaid),
        textCell(invoice.balance),
        textCell(invoice.dateUpdated),
        textCell(invoice.status),
        textCell("Fermosa - Trece Martires"),
      ]),
    };
  }

  private filteredActivity(): MockPatientProfile["activity"] {
    const activity = V1["activity-log"].elements;
    const keyword = (this.formValues.get(activity.keywordInput ?? "") ?? "").trim().toLowerCase();
    const from = this.formValues.get(activity.fromInput ?? "") ?? "";
    const to = this.formValues.get(activity.toInput ?? "") ?? "";

    return DEMO_PATIENTS.flatMap((patient) =>
      patient.activity.filter((entry) => {
        if (keyword) {
          const haystack = [
            patient.fullName,
            entry.logName,
            entry.description,
            entry.causedBy,
            ...Object.values(entry.details),
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(keyword)) return false;
        }
        const day = entry.date.slice(0, 10);
        if (from && day < from.slice(0, 10)) return false;
        if (to && day > to.slice(0, 10)) return false;
        return true;
      })
    );
  }

  private activityTable(entries: MockPatientProfile["activity"]): TableData {
    return {
      headers: ACTIVITY_HEADERS,
      rows: entries.map((entry, index) => [
        textCell(""),
        textCell(String(index + 1)),
        textCell(entry.logName),
        textCell(entry.description),
        textCell(entry.causedBy),
        textCell(entry.date),
        textCell(
          Object.entries(entry.details)
            .map(([k, v]) => `${k} ${v}`)
            .join(" ")
        ),
        textCell(
          Object.entries(entry.oldDetails)
            .map(([k, v]) => `${k} ${v}`)
            .join(" ")
        ),
      ]),
    };
  }
}
