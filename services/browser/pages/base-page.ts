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

  /** Structural fingerprint check — layout-drift detection. */
  async assertFingerprint(): Promise<void> {
    for (const selector of this.registry.fingerprint(this.pageId)) {
      if (!(await this.driver.isVisible(selector))) {
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
