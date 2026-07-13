import { browserError, type PageId } from "./types";

/**
 * SelectorRegistry (Sprint 3.9) — versioned selector maps, mirroring OCR's
 * prompt versioning. Selectors NEVER live inside page objects: a CRM redesign
 * means a new selector map version, zero page-object changes. Every scraped
 * record is stamped with the active version (`sourceRef`).
 */

export interface PageSelectors {
  /** The page's URL path in the CRM. */
  path: string;
  /** Selectors that MUST be present — layout-drift detection (CRM_LAYOUT). */
  fingerprint: readonly string[];
  /** Named element selectors used by the page object. */
  elements: Readonly<Record<string, string>>;
}

export interface SelectorMap {
  version: string;
  pages: Readonly<Record<PageId, PageSelectors>>;
}

/**
 * v1 — shaped by the CRM reference captures (docs/crm-reference, local-only):
 * real routes and observed structure, placeholder element selectors to be
 * confirmed against the live login capture before real automation.
 */
export const SELECTOR_MAP_V1: SelectorMap = {
  version: "crm-selectors/v1",
  pages: {
    login: {
      path: "/login",
      fingerprint: ["form#login", "input[name=username]", "input[name=password]"],
      elements: {
        username: "input[name=username]",
        password: "input[name=password]",
        submit: "button[type=submit]",
        captcha: ".captcha-challenge",
      },
    },
    dashboard: {
      path: "/",
      fingerprint: ["nav.sidebar", "a[href='/clients']"],
      elements: {
        patientsLink: "a[href='/clients']",
        invoiceLink: "a[href='/invoice']",
        activityLink: "a[href='/activity-logs']",
        userChrome: ".user-menu",
      },
    },
    "patient-search": {
      path: "/clients",
      fingerprint: ["form.search-form", "table.patients-table"],
      elements: {
        nameInput: "input[name=client_name]",
        dobInput: "input[name=dob]",
        mobileInput: "input[name=mobile_no]",
        searchButton: "button.search-submit",
        resultRows: "table.patients-table tbody tr",
      },
    },
    "patient-profile": {
      path: "/clients/{cid}",
      fingerprint: [".patient-header", "table.treatment-records"],
      elements: {
        patientName: ".patient-header .full-name",
        treatmentRows: "table.treatment-records tbody tr",
        invoiceTab: "a.tab-invoice",
        historyTab: "a.tab-history",
      },
    },
    invoice: {
      path: "/invoice",
      fingerprint: ["table.invoice-table"],
      elements: {
        rows: "table.invoice-table tbody tr",
        refCell: "td.ref-no",
        statusCell: "td.status",
      },
    },
    "activity-log": {
      path: "/activity-logs",
      fingerprint: ["table.activity-table", ".filters"],
      elements: {
        rows: "table.activity-table tbody tr",
        filterCausedBy: "select[name=caused_by]",
        nextPage: "a.pagination-next",
      },
    },
  },
};

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
      throw browserError(
        "CRM_LAYOUT",
        `Selector "${key}" is not defined for page "${pageId}" in ${this.map.version}.`
      );
    }
    return found;
  }

  fingerprint(pageId: PageId): readonly string[] {
    return this.map.pages[pageId].fingerprint;
  }
}
