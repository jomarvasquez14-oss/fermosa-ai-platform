import { logger } from "@/lib/logger";
import { DashboardPage, LoginPage } from "./pages";
import { navigationTimeout, withTimeout } from "./policies";
import type { SelectorRegistry } from "./selector-registry";
import {
  browserError,
  type BrowserCredentials,
  type BrowserDriver,
  type SessionStatus,
  type TimeoutPolicy,
} from "./types";

/**
 * BrowserSession (Sprint 3.9): login, logout, expiry detection, reconnect,
 * health check. One authenticated context per discovery run
 * (CRM_DISCOVERY §5); credentials are held in memory only.
 */
export class BrowserSession {
  private statusValue: SessionStatus = "disconnected";

  constructor(
    readonly driver: BrowserDriver,
    private readonly registry: SelectorRegistry,
    private readonly credentials: BrowserCredentials,
    private readonly timeouts: TimeoutPolicy
  ) {}

  get status(): SessionStatus {
    return this.statusValue;
  }

  async login(): Promise<void> {
    const loginPage = new LoginPage(this.driver, this.registry);
    await withTimeout(
      navigationTimeout(this.timeouts),
      "Login navigation",
      this.driver.goto(loginPage.path)
    );
    await loginPage.submitCredentials(this.credentials.username, this.credentials.password);

    const dashboard = new DashboardPage(this.driver, this.registry);
    if (!(await dashboard.isAuthenticated())) {
      this.statusValue = "disconnected";
      throw browserError(
        "CRM_FORBIDDEN",
        "Login did not reach the dashboard — check the service account's credentials and permissions."
      );
    }
    this.statusValue = "authenticated";
    logger.info("CRM session authenticated", { registry: this.registry.version });
  }

  async logout(): Promise<void> {
    this.statusValue = "disconnected";
    await this.driver.goto("/logout");
  }

  /** The "am I still logged in?" invariant every navigation asserts (§5). */
  async detectExpiry(): Promise<boolean> {
    const loginVisible = await this.driver.isVisible(this.registry.selector("login", "username"));
    if (loginVisible && this.statusValue === "authenticated") {
      this.statusValue = "expired";
    }
    return this.statusValue === "expired";
  }

  /** One re-authentication per call; a second expiry escalates (§5). */
  async reconnect(): Promise<void> {
    logger.warn("CRM session expired — reconnecting");
    await this.login();
    if (this.statusValue !== "authenticated") {
      throw browserError("CRM_SESSION", "Re-authentication after session expiry failed.");
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const dashboard = new DashboardPage(this.driver, this.registry);
      await this.driver.goto(dashboard.path);
      await dashboard.assertFingerprint();
      const authenticated = await dashboard.isAuthenticated();
      return {
        ok: authenticated,
        detail: authenticated
          ? `authenticated (${this.registry.version})`
          : "reachable but not authenticated",
      };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
