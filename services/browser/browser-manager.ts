import { NavigationManager } from "./navigation-manager";
import { SelectorRegistry } from "./selector-registry";
import { BrowserSession } from "./session";
import {
  DEFAULT_RETRY_POLICY,
  DEFAULT_TIMEOUT_POLICY,
  type BrowserCredentials,
  type BrowserDriver,
  type RetryPolicy,
  type TimeoutPolicy,
} from "./types";

/**
 * BrowserManager (Sprint 3.9): wires driver + registry + session + navigation
 * into one handle. One manager = one browser context = one CRM session
 * (CRM_DISCOVERY §5 — never a shared global session across concurrent runs).
 */
export class BrowserManager {
  readonly session: BrowserSession;
  readonly navigation: NavigationManager;
  readonly registry: SelectorRegistry;

  constructor(
    readonly driver: BrowserDriver,
    credentials: BrowserCredentials,
    registry: SelectorRegistry = new SelectorRegistry(),
    retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
    timeouts: TimeoutPolicy = DEFAULT_TIMEOUT_POLICY
  ) {
    this.registry = registry;
    this.session = new BrowserSession(driver, registry, credentials, timeouts);
    this.navigation = new NavigationManager(this.session, registry, retryPolicy, timeouts);
  }

  async dispose(): Promise<void> {
    await this.driver.close();
  }
}
