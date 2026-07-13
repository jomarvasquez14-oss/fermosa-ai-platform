import { browserError, type BrowserDriver } from "../types";
import { SELECTOR_MAP_V1 } from "../selector-registry";

/**
 * MockBrowserDriver (Sprint 3.9) — an in-memory simulation of the CRM,
 * aligned with the v1 selector map so page fingerprints pass. Scriptable
 * failure modes make every framework path testable and demonstrable in
 * /dev/browser without touching the live system:
 *
 *   expireSession()        next authenticated page shows the login form
 *   failNextNavigations(n) network failures (CRM_UNAVAILABLE) for n gotos
 *   showCaptcha(bool)      login page grows a CAPTCHA
 *   breakLayout(path)      remove a page's fingerprint elements
 *   reset()                back to a healthy logged-out CRM
 */
export class MockBrowserDriver implements BrowserDriver {
  private url = "about:blank";
  private authenticated = false;
  private expired = false;
  private captcha = false;
  private failNavigations = 0;
  private brokenPaths = new Set<string>();
  private readonly formValues = new Map<string, string>();

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
  breakLayout(path: string): void {
    this.brokenPaths.add(path);
  }
  reset(): void {
    this.url = "about:blank";
    this.authenticated = false;
    this.expired = false;
    this.captcha = false;
    this.failNavigations = 0;
    this.brokenPaths.clear();
    this.formValues.clear();
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

  // ---- BrowserDriver ----
  async goto(url: string): Promise<void> {
    if (this.failNavigations > 0) {
      this.failNavigations--;
      throw browserError("CRM_UNAVAILABLE", `Simulated network failure reaching ${url}.`);
    }
    if (url === "/logout") {
      this.authenticated = false;
      this.expired = false;
      this.url = "/login";
      return;
    }
    this.url = url;
  }

  async currentUrl(): Promise<string> {
    return this.url;
  }

  async fill(selector: string, value: string): Promise<void> {
    this.formValues.set(selector, value);
  }

  async click(selector: string): Promise<void> {
    const login = SELECTOR_MAP_V1.pages.login.elements;
    if (selector === login.submit && this.effectivePath() === "/login") {
      const username = this.formValues.get(login.username ?? "");
      const password = this.formValues.get(login.password ?? "");
      if (username && password) {
        this.authenticated = true;
        this.expired = false;
        this.url = "/";
      }
    }
  }

  async readText(selector: string): Promise<string | null> {
    if (selector === SELECTOR_MAP_V1.pages["patient-search"].elements.resultRows) return "3";
    if (selector === SELECTOR_MAP_V1.pages["patient-profile"].elements.patientName) {
      return "Santos, Maria";
    }
    return null;
  }

  async isVisible(selector: string): Promise<boolean> {
    const path = this.effectivePath();
    if (this.brokenPaths.has(path)) return false;

    const pageEntry = Object.values(SELECTOR_MAP_V1.pages).find((page) => page.path === path);
    if (!pageEntry) return false;

    const belongsToPage =
      pageEntry.fingerprint.includes(selector) ||
      Object.values(pageEntry.elements).includes(selector);
    if (!belongsToPage) return false;

    if (selector === SELECTOR_MAP_V1.pages.login.elements.captcha) return this.captcha;
    if (selector === SELECTOR_MAP_V1.pages.dashboard.elements.userChrome) {
      return this.authenticated && !this.expired;
    }
    return true;
  }

  async close(): Promise<void> {
    this.reset();
  }

  /** Expired sessions render the login page regardless of the requested URL. */
  private effectivePath(): string {
    if (this.url === "about:blank") return "about:blank";
    if (this.expired) return "/login";
    if (!this.authenticated && this.url !== "/login") return "/login";
    // Normalize the parameterized profile path.
    if (this.url.startsWith("/clients/")) return "/clients/{cid}";
    return this.url;
  }
}
