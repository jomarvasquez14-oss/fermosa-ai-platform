import type { BrowserDriver } from "@/services/browser/driver/browser-driver";
import { NavigationManager } from "@/services/browser/navigation/navigation-manager";
import { SelectorRegistry } from "@/services/browser/selectors";
import { BrowserSessionManager } from "@/services/browser/session/session-manager";
import {
  DEFAULT_NAVIGATION_POLICY,
  DEFAULT_RETRY_POLICY,
  DEFAULT_TIMEOUT_POLICY,
  type BrowserCredentials,
  type NavigationPolicy,
  type RetryPolicy,
  type TimeoutPolicy,
} from "@/services/browser/types";

/**
 * BrowserManager (ADR-031): wires driver + registry + session + navigation
 * into one handle. One manager = one browser context = one CRM session
 * (CRM_DISCOVERY §5 — never a shared global session across concurrent runs).
 */
export class BrowserManager {
  readonly session: BrowserSessionManager;
  readonly navigation: NavigationManager;
  readonly registry: SelectorRegistry;

  constructor(
    readonly driver: BrowserDriver,
    credentials: BrowserCredentials,
    registry: SelectorRegistry = new SelectorRegistry(),
    retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
    timeouts: TimeoutPolicy = DEFAULT_TIMEOUT_POLICY,
    navigationPolicy: NavigationPolicy = DEFAULT_NAVIGATION_POLICY
  ) {
    this.registry = registry;
    this.session = new BrowserSessionManager(driver, registry, credentials, timeouts);
    this.navigation = new NavigationManager(
      this.session,
      registry,
      retryPolicy,
      timeouts,
      navigationPolicy
    );
  }

  async dispose(): Promise<void> {
    await this.driver.close();
  }
}
