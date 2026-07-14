import type { BrowserDriver } from "@/services/browser/driver/browser-driver";
import type { SelectorRegistry } from "@/services/browser/selectors";
import { LayoutChangedError, type PageId } from "@/services/browser/types";

/**
 * PageObject base (ADR-031). A page object owns BEHAVIOR only — selectors
 * come from the registry, the browser from the driver, and nothing here may
 * mutate CRM state (read-only contract, PROJECT_RULES #24). Every page
 * validates its structural fingerprint before use so a CRM redesign fails
 * loudly as CRM_LAYOUT (naming the missing selector), never as silently
 * wrong data.
 */

/** How long a fingerprint element may take to become visible after load. */
const FINGERPRINT_TIMEOUT_MS = 10_000;
export abstract class BasePage {
  abstract readonly pageId: PageId;

  constructor(
    readonly driver: BrowserDriver,
    protected readonly registry: SelectorRegistry
  ) {}

  get path(): string {
    return this.registry.page(this.pageId).path;
  }

  protected sel(key: string): string {
    return this.registry.selector(this.pageId, key);
  }

  /**
   * Structural fingerprint check — layout-drift detection. Fingerprint
   * elements are WAITED for, not probed instantly (M0042A): the CRM ships
   * server HTML with tables CSS-hidden until page JS initializes them
   * (e.g. #activity-logs-table), so an instant isVisible would race that
   * init and misreport healthy pages as drifted.
   */
  async assertFingerprint(): Promise<void> {
    for (const selector of this.registry.fingerprint(this.pageId)) {
      try {
        await this.driver.waitFor(selector, {
          state: "visible",
          timeoutMs: FINGERPRINT_TIMEOUT_MS,
        });
      } catch {
        throw new LayoutChangedError(
          `Page "${this.pageId}" does not match ${this.registry.version}: expected "${selector}" is missing. The selector map likely needs a new version.`
        );
      }
    }
  }

  async isOpen(): Promise<boolean> {
    try {
      await this.assertFingerprint();
      return true;
    } catch {
      return false;
    }
  }
}
