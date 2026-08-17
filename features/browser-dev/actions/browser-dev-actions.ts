"use server";

import { getServerEnv } from "@/lib/config/env";
import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import {
  BrowserManager,
  MockBrowserDriver,
  SELECTOR_MAP_V1,
  type NavigablePageId,
  type PageId,
} from "@/services/browser";
import {
  getCRMConnector,
  type FindPatientsQuery,
  type FindPatientsResult,
  type NormalizedCrmPatientRecord,
} from "@/services/crm";

/**
 * /dev/browser actions — Super Admin tooling with two halves (M0042):
 *
 *  - Framework drills run against the MOCK driver (one dev session per server
 *    process; the scriptable failure modes below only exist on the mock).
 *  - The "CRM connector" commands (health, patient search, open patient) go
 *    through `getCRMConnector()`, so with `CRM_CONNECTOR=playwright` they
 *    exercise the real PlaywrightCRMConnector (ADR-033) against the live CRM —
 *    this page is the supervised live-validation cockpit (ADR-034).
 */

const driver = new MockBrowserDriver();
const manager = new BrowserManager(
  driver,
  { username: "fermosa-audit-bot", password: "dev-only" },
  undefined,
  { maxAttempts: 3, delayMs: 25 }
);

export interface BrowserDevState {
  session: string;
  /** Which connector strategy `getCRMConnector()` resolves right now. */
  connector: {
    configured: string;
    kind: string;
    /** Presence of each live-CRM env var (never the values). */
    credentials: { url: boolean; username: boolean; password: boolean };
    /** True when the resolved connector can actually run (mock always can). */
    ready: boolean;
  };
  driver: {
    url: string;
    authenticated: boolean;
    expired: boolean;
    captcha: boolean;
    pendingNetworkFailures: number;
    brokenPaths: string[];
  };
  history: PageId[];
  registryVersion: string;
  /** Capability flags gating selectors not yet confirmed (invoiceDetail…). */
  capabilities: Record<string, boolean>;
  registry: Array<{
    page: string;
    path: string;
    fingerprint: number;
    elements: string[];
    /** Strongest evidence behind the page's selectors (M0042A). */
    verification: string;
  }>;
  lastResult: string | null;
  lastError: { code: string; message: string } | null;
}

let lastResult: string | null = null;
let lastError: { code: string; message: string } | null = null;

async function run(label: string, operation: () => Promise<string>): Promise<void> {
  try {
    lastResult = await operation();
    lastError = null;
  } catch (error) {
    lastResult = null;
    lastError = isAppError(error)
      ? { code: error.code, message: error.message }
      : { code: "UNKNOWN", message: error instanceof Error ? error.message : String(error) };
  }
  void label;
}

export async function getBrowserDevStateAction(): Promise<BrowserDevState> {
  await requirePermission("playground:access");
  const env = getServerEnv();
  const configured = env.CRM_CONNECTOR;
  const credentials = {
    url: Boolean(env.CRM_URL),
    username: Boolean(env.CRM_USERNAME),
    password: Boolean(env.CRM_PASSWORD),
  };
  const needsCredentials = configured === "playwright" || configured === "browser-automation";
  return {
    session: manager.session.status,
    connector: {
      configured,
      kind: configured === "playwright" ? "browser-automation" : configured,
      credentials,
      ready: !needsCredentials || (credentials.url && credentials.username && credentials.password),
    },
    driver: driver.state,
    history: [...manager.navigation.history] as PageId[],
    registryVersion: manager.registry.version,
    capabilities: { ...SELECTOR_MAP_V1.capabilities },
    registry: Object.entries(SELECTOR_MAP_V1.pages).map(([page, config]) => ({
      page,
      path: config.path,
      fingerprint: config.fingerprint.length,
      elements: Object.keys(config.elements),
      verification: config.verification,
    })),
    lastResult,
    lastError,
  };
}

export async function browserDevCommandAction(
  command:
    | { kind: "login" }
    | { kind: "logout" }
    | { kind: "health" }
    | { kind: "crm-health" }
    | { kind: "navigate"; page: NavigablePageId }
    | { kind: "expire-session" }
    | { kind: "network-failures"; count: number }
    | { kind: "captcha"; enabled: boolean }
    | { kind: "break-layout"; path: string }
    | { kind: "reset" }
): Promise<BrowserDevState> {
  await requirePermission("playground:access");

  switch (command.kind) {
    case "login":
      await run("login", async () => {
        await manager.session.login();
        return "Logged in — dashboard fingerprint verified.";
      });
      break;
    case "logout":
      await run("logout", async () => {
        await manager.session.logout();
        return "Logged out.";
      });
      break;
    case "health":
      await run("health", async () => {
        const health = await manager.session.healthCheck();
        return `healthCheck → ok=${health.ok} (${health.detail})`;
      });
      break;
    case "crm-health":
      await run("crm-health", async () => {
        const connector = getCRMConnector();
        const health = await connector.healthCheck();
        return `${connector.kind} connector → ok=${health.ok} (${health.detail ?? "no detail"})`;
      });
      break;
    case "navigate":
      await run("navigate", async () => {
        const page = await manager.navigation.navigateTo(command.page);
        return `Navigated to ${command.page} (${page.path}) — fingerprint OK.`;
      });
      break;
    case "expire-session":
      driver.expireSession();
      lastResult = "Session expiry armed — the next navigation must auto-reconnect.";
      lastError = null;
      break;
    case "network-failures":
      driver.failNextNavigations(command.count);
      lastResult = `Next ${command.count} navigation(s) will fail (CRM_UNAVAILABLE) — retry policy should absorb up to 2.`;
      lastError = null;
      break;
    case "captcha":
      driver.showCaptcha(command.enabled);
      lastResult = command.enabled
        ? "CAPTCHA armed on the login page — the next login must stop with CRM_CHALLENGE."
        : "CAPTCHA disarmed.";
      lastError = null;
      break;
    case "break-layout":
      driver.breakLayout(command.path);
      lastResult = `Layout broken for ${command.path} — navigation there must fail as CRM_LAYOUT.`;
      lastError = null;
      break;
    case "reset":
      driver.reset();
      lastResult = "Mock CRM reset to healthy, logged-out state.";
      lastError = null;
      break;
  }

  return getBrowserDevStateAction();
}

// ---------------------------------------------------------------------------
// Connector cockpit (M0042 Phase 6) — search / open patient / normalized JSON
// through whichever connector `getCRMConnector()` resolves. With
// CRM_CONNECTOR=playwright these calls ARE the live-validation checklist.
// ---------------------------------------------------------------------------

export type ConnectorResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export async function connectorFindPatientsAction(
  query: FindPatientsQuery
): Promise<ConnectorResult<FindPatientsResult>> {
  try {
    await requirePermission("playground:access");
    return { ok: true, data: await getCRMConnector().findPatients(query) };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message, code: error.code };
    return { ok: false, error: "Patient search failed unexpectedly. Check server logs." };
  }
}

export async function connectorFetchRecordAction(
  crmId: string,
  window?: { from: string; to: string }
): Promise<ConnectorResult<NormalizedCrmPatientRecord>> {
  try {
    await requirePermission("playground:access");
    return { ok: true, data: await getCRMConnector().fetchPatientRecord(crmId, window) };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message, code: error.code };
    return { ok: false, error: "Record retrieval failed unexpectedly. Check server logs." };
  }
}
