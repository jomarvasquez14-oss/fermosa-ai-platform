"use server";

import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import {
  BrowserManager,
  MockBrowserDriver,
  SELECTOR_MAP_V1,
  type PageId,
} from "@/services/browser";

/**
 * /dev/browser actions (Sprint 3.9) — Super Admin tooling that drives the
 * browser framework against the MOCK driver. One dev session per server
 * process; nothing here can reach the live CRM (the mock driver is the only
 * driver that exists).
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
  registry: Array<{ page: string; path: string; fingerprint: number; elements: string[] }>;
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
  return {
    session: manager.session.status,
    driver: driver.state,
    history: [...manager.navigation.history] as PageId[],
    registryVersion: manager.registry.version,
    registry: Object.entries(SELECTOR_MAP_V1.pages).map(([page, config]) => ({
      page,
      path: config.path,
      fingerprint: config.fingerprint.length,
      elements: Object.keys(config.elements),
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
    | { kind: "navigate"; page: PageId }
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
