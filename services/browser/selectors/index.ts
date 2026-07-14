import { LayoutChangedError, type PageId } from "@/services/browser/types";
import { SELECTOR_MAP_V1, type PageSelectors, type SelectorMap } from "./v1";

export { SELECTOR_MAP_V1 };
export type { PageSelectors, SelectorMap };

/**
 * SelectorRegistry (ADR-031) — versioned selector maps, mirroring OCR's
 * prompt versioning. Selectors NEVER live inside page objects: a CRM redesign
 * means a new selector map version, zero page-object changes. Every scraped
 * record is stamped with the active version (`sourceRef`).
 */
export class SelectorRegistry {
  constructor(private readonly map: SelectorMap = SELECTOR_MAP_V1) {}

  get version(): string {
    return this.map.version;
  }

  page(pageId: PageId): PageSelectors {
    return this.map.pages[pageId];
  }

  /** Named selector lookup — unknown keys are wiring bugs, loud ones. */
  selector(pageId: PageId, key: string): string {
    const found = this.map.pages[pageId].elements[key];
    if (!found) {
      throw new LayoutChangedError(
        `Selector "${key}" is not defined for page "${pageId}" in ${this.map.version}.`
      );
    }
    return found;
  }

  fingerprint(pageId: PageId): readonly string[] {
    return this.map.pages[pageId].fingerprint;
  }

  /** Selector-dependent feature switch (e.g. unconfirmed detail triggers). */
  capability(name: string): boolean {
    return this.map.capabilities[name] === true;
  }
}
