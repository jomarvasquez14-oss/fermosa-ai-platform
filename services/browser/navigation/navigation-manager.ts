import { isAppError } from "@/lib/errors";
import type { BasePage } from "@/services/browser/pages";
import { PAGE_CLASSES } from "@/services/browser/pages";
import { NEUTRALIZE_ANNOUNCEMENTS_EXPRESSION } from "@/services/browser/pages/interstitials";
import {
  navigationTimeout,
  politenessDelay,
  withRetry,
  withTimeout,
} from "@/services/browser/policies";
import type { SelectorRegistry } from "@/services/browser/selectors";
import type { BrowserSessionManager } from "@/services/browser/session/session-manager";
import {
  browserError,
  type NavigablePageId,
  type NavigationPolicy,
  type RetryPolicy,
  type TimeoutPolicy,
} from "@/services/browser/types";

/**
 * NavigationManager (ADR-031): navigate → wait → verify → recover.
 * Transient failures retry with a fresh page load; session expiry recovers
 * via ONE reconnect; layout drift and captchas surface immediately
 * (CRM_DISCOVERY §5). A jittered politeness delay precedes every load —
 * discovery must be indistinguishable from a careful human clerk. Keeps a
 * navigation history for diagnostics.
 */
export class NavigationManager {
  private readonly historyLog: NavigablePageId[] = [];

  constructor(
    private readonly session: BrowserSessionManager,
    private readonly registry: SelectorRegistry,
    private readonly retryPolicy: RetryPolicy,
    private readonly timeouts: TimeoutPolicy,
    private readonly navigationPolicy: NavigationPolicy
  ) {}

  get history(): readonly NavigablePageId[] {
    return this.historyLog;
  }

  async navigateTo(
    pageId: NavigablePageId,
    pathParams?: Record<string, string>
  ): Promise<BasePage> {
    if (pageId !== "login" && this.session.status === "disconnected") {
      throw browserError("CRM_SESSION", "No authenticated session — call login() first.");
    }

    const page = new PAGE_CLASSES[pageId](this.session.driver, this.registry);
    const path = this.resolvePath(page.path, pathParams);

    await withRetry(this.retryPolicy, async () => {
      await politenessDelay(this.navigationPolicy);
      await withTimeout(
        navigationTimeout(this.timeouts),
        `Navigation to ${pageId}`,
        this.session.driver.goto(path)
      );

      // Expiry recovery: reconnect once, then re-attempt this navigation.
      if (pageId !== "login" && (await this.session.detectExpiry())) {
        await this.session.reconnect();
        await this.session.driver.goto(path);
      }

      try {
        await page.assertFingerprint();
      } catch (error) {
        // An unexpected page that is actually the login page = expired session.
        if (
          isAppError(error) &&
          error.code === "CRM_LAYOUT" &&
          (await this.session.detectExpiry())
        ) {
          await this.session.reconnect();
          await this.session.driver.goto(path);
          await page.assertFingerprint();
        } else {
          throw error;
        }
      }
    });

    // The announcement poller runs on EVERY authenticated page and re-shows
    // its static-backdrop modal every 5s (M0042A, announcements.js) —
    // neutralize after each load so subsequent clicks are never blocked.
    if (pageId !== "login") {
      await this.session.driver.evaluate(NEUTRALIZE_ANNOUNCEMENTS_EXPRESSION);
    }

    this.session.markActivity();
    this.historyLog.push(pageId);
    return page;
  }

  private resolvePath(template: string, params?: Record<string, string>): string {
    if (!params) return template;
    return Object.entries(params).reduce(
      (path, [key, value]) => path.replace(`{${key}}`, value),
      template
    );
  }
}
