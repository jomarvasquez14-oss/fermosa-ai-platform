import { logger } from "@/lib/logger";
import type { BrowserDriver } from "@/services/browser/driver/browser-driver";
import { DashboardPage, LoginPage } from "@/services/browser/pages";
import { navigationTimeout, withTimeout } from "@/services/browser/policies";
import type { SelectorRegistry } from "@/services/browser/selectors";
import {
  AuthenticationFailedError,
  SessionExpiredError,
  type BrowserCredentials,
  type SessionStatus,
  type TimeoutPolicy,
} from "@/services/browser/types";

/**
 * BrowserSessionManager (ADR-031/033): launch, login, logout detection,
 * expiry recovery, idle re-verification, health check. One manager = one
 * browser context = ONE login per execution (CRM_DISCOVERY §5) — operations
 * reuse the authenticated context and its cookies, which live in memory
 * only and are never persisted to disk. Credentials are held in memory and
 * appear in no log line.
 */
export class BrowserSessionManager {
  private statusValue: SessionStatus = "disconnected";
  private launched = false;
  private loginInFlight: Promise<void> | null = null;
  private lastActivityAt = 0;

  constructor(
    readonly driver: BrowserDriver,
    private readonly registry: SelectorRegistry,
    private readonly credentials: BrowserCredentials,
    private readonly timeouts: TimeoutPolicy
  ) {}

  get status(): SessionStatus {
    return this.statusValue;
  }

  /** Bump the idle clock — called by every navigation/operation. */
  markActivity(): void {
    this.lastActivityAt = Date.now();
  }

  async launch(): Promise<void> {
    if (this.launched) return;
    await this.driver.launch();
    this.launched = true;
  }

  /**
   * Single login per execution: concurrent callers share one in-flight
   * attempt, later callers reuse the authenticated session.
   */
  async login(): Promise<void> {
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = this.performLogin().finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  /**
   * The entry point operations use: launches on demand, logs in when
   * disconnected, and after an idle gap re-verifies instead of trusting a
   * possibly-expired cookie.
   */
  async ensureAuthenticated(): Promise<void> {
    await this.launch();
    if (this.statusValue === "authenticated" && !this.idleExpired()) return;
    if (this.statusValue === "authenticated" && this.idleExpired()) {
      logger.info("CRM session idle past budget — re-verifying", {
        idleMs: Date.now() - this.lastActivityAt,
      });
      if (!(await this.detectExpiry())) {
        this.markActivity();
        return;
      }
    }
    if (this.statusValue === "expired") {
      await this.reconnect();
      return;
    }
    await this.login();
  }

  /**
   * Logout via the CRM's own POST form (avatar dropdown). Never a bare GET —
   * the route is POST-only with a CSRF token the form already carries.
   */
  async logout(): Promise<void> {
    if (this.statusValue !== "disconnected") {
      const dashboard = new DashboardPage(this.driver, this.registry);
      await this.driver.goto(dashboard.path);
      if (await dashboard.isAuthenticated()) {
        await this.driver.click(this.registry.selector("dashboard", "userChrome"));
        await this.driver.click(this.registry.selector("dashboard", "logoutButton"));
      }
    }
    this.statusValue = "disconnected";
  }

  /** The "am I still logged in?" invariant every navigation asserts (§5). */
  async detectExpiry(): Promise<boolean> {
    const loginVisible = await this.driver.isVisible(this.registry.selector("login", "password"));
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
      throw new SessionExpiredError("Re-authentication after session expiry failed.");
    }
  }

  /**
   * Authenticates first: an unauthenticated dashboard visit redirects to
   * /login, whose DOM would misreport as layout drift (observed live, M0049).
   * The probe's job is "can we reach AND log in to the CRM" — so it logs in.
   */
  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.ensureAuthenticated();
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

  private async performLogin(): Promise<void> {
    await this.launch();
    const loginPage = new LoginPage(this.driver, this.registry);
    await withTimeout(
      navigationTimeout(this.timeouts),
      "Login navigation",
      this.driver.goto(loginPage.path)
    );
    await loginPage.submitCredentials(this.credentials.username, this.credentials.password);

    const dashboard = new DashboardPage(this.driver, this.registry);
    // Wait for the post-submit redirect to render the dashboard — an instant
    // check races the live server (M0042).
    if (!(await dashboard.waitUntilAuthenticated(navigationTimeout(this.timeouts)))) {
      this.statusValue = "disconnected";
      throw new AuthenticationFailedError(
        "Login did not reach the dashboard — check the service account's credentials and permissions."
      );
    }
    await dashboard.dismissAnnouncements();
    this.statusValue = "authenticated";
    this.markActivity();
    logger.info("CRM session authenticated", { registry: this.registry.version });
  }

  private idleExpired(): boolean {
    return this.timeouts.idleMs > 0 && Date.now() - this.lastActivityAt > this.timeouts.idleMs;
  }
}

/** Historical name from Sprint 3.9 — same class, kept for callers. */
export { BrowserSessionManager as BrowserSession };
