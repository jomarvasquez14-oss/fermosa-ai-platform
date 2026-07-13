import { isAppError } from "@/lib/errors";
import { BasePage } from "./base-page";
import { PAGE_CLASSES } from "./pages";
import { navigationTimeout, withRetry, withTimeout } from "./policies";
import type { SelectorRegistry } from "./selector-registry";
import type { BrowserSession } from "./session";
import { browserError, type PageId, type RetryPolicy, type TimeoutPolicy } from "./types";

/**
 * NavigationManager (Sprint 3.9): navigate → wait → verify → recover.
 * Transient failures retry with a fresh page load; session expiry recovers
 * via ONE reconnect; layout drift and captchas surface immediately
 * (CRM_DISCOVERY §5). Keeps a navigation history for diagnostics.
 */
export class NavigationManager {
  private readonly historyLog: PageId[] = [];

  constructor(
    private readonly session: BrowserSession,
    private readonly registry: SelectorRegistry,
    private readonly retryPolicy: RetryPolicy,
    private readonly timeouts: TimeoutPolicy
  ) {}

  get history(): readonly PageId[] {
    return this.historyLog;
  }

  async navigateTo(pageId: PageId): Promise<BasePage> {
    if (pageId !== "login" && this.session.status === "disconnected") {
      throw browserError("CRM_SESSION", "No authenticated session — call login() first.");
    }

    const page = new PAGE_CLASSES[pageId](this.session.driver, this.registry);

    await withRetry(this.retryPolicy, async () => {
      await withTimeout(
        navigationTimeout(this.timeouts),
        `Navigation to ${pageId}`,
        this.session.driver.goto(page.path)
      );

      // Expiry recovery: reconnect once, then re-attempt this navigation.
      if (pageId !== "login" && (await this.session.detectExpiry())) {
        await this.session.reconnect();
        await this.session.driver.goto(page.path);
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
          await this.session.driver.goto(page.path);
          await page.assertFingerprint();
        } else {
          throw error;
        }
      }
    });

    this.historyLog.push(pageId);
    return page;
  }
}
