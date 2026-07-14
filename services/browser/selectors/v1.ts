import type { PageId } from "@/services/browser/types";

/**
 * Selector map v1 — derived from the authoritative CRM reference captures
 * (docs/crm-reference/, local-only; studied 2026-07-14). Every selector below
 * was observed in a real export except the LOGIN page, which was never
 * captured (CRM_DISCOVERY §8 gating risk): its selectors are conservative
 * provisional guesses and MUST be confirmed on the first live run.
 *
 * Versioning contract (ADR-031): the CRM has no versioned markup, so this map
 * is the version. A CRM redesign means a NEW map file (v2.ts), zero page-object
 * changes; every scraped record carries the active version in `sourceRef`.
 */

export interface PageSelectors {
  /** The page's URL path in the CRM ("#fragment" marks a tab section). */
  path: string;
  /** Selectors that MUST be visible before parsing — layout-drift detection. */
  fingerprint: readonly string[];
  /** Named element selectors used by the page object. */
  elements: Readonly<Record<string, string>>;
  /**
   * Mutating controls observed on this page that automation must NEVER
   * touch (read-only contract, PROJECT_RULES #24). Documentation and
   * test material — page objects expose no operation that reaches these.
   */
  neverInteract?: readonly string[];
}

export interface SelectorMap {
  version: string;
  /** Feature switches that depend on selectors not yet confirmed live. */
  capabilities: Readonly<Record<string, boolean>>;
  pages: Readonly<Record<PageId, PageSelectors>>;
}

export const SELECTOR_MAP_V1: SelectorMap = {
  version: "crm-selectors/v1",
  capabilities: {
    /**
     * The invoice DETAIL view (SERVICES + PAYMENTS tables, per the reference
     * photos) is reached by invoice.js, which the captures do not include.
     * Until the trigger is confirmed against the live CRM, connectors must
     * not attempt detail retrieval — invoice payments stay null.
     */
    invoiceDetail: false,
  },
  pages: {
    // -- NOT captured; provisional (login export is the §8 gating input) -----
    login: {
      path: "/login",
      fingerprint: ["input[type=password]"],
      elements: {
        username: "input[name=username], input[name=email], form input[type=text]",
        password: "input[type=password]",
        submit: "button[type=submit], input[type=submit]",
        captcha: "[class*=captcha], iframe[src*=captcha], .g-recaptcha",
      },
    },

    dashboard: {
      path: "/",
      fingerprint: [".site-navbar"],
      elements: {
        userChrome: ".navbar-avatar",
        logoutButton: "form[action$='/logout'] button[type=submit]",
        patientsLink: "a[href$='/clients']",
        invoiceLink: "a[href$='/invoice']",
        activityLink: "a[href$='/activity-logs']",
        announcementModal: "#announcement-modal",
        announcementDismiss: "#announcement-modal [data-dismiss=modal]",
      },
    },

    // -- /clients: GET filter form + server-rendered dataTable ---------------
    "patient-search": {
      path: "/clients",
      fingerprint: ["input[name=search]", "table[data-plugin=dataTable]"],
      elements: {
        nameInput: "input[name=search]",
        mobileInput: "input[name=search_mobile]",
        lastVisitFromInput: "input[name=last_dental_visit_from]",
        lastVisitToInput: "input[name=last_dental_visit_to]",
        submit: "input[type=submit]#search",
        resetLink: "a.btn[href$='/clients']",
        resultsTable: "table[data-plugin=dataTable]",
        resultRows: "table[data-plugin=dataTable] tbody tr",
        viewClientLink: "a[title='View client']",
        paginationNext: "ul.pagination a[rel=next], ul.pagination a[aria-label*='Next']",
      },
      neverInteract: [
        "a[data-delete]",
        "a[data-confirm-link]",
        "[data-target='#newClientsModal']",
        "[data-target='#updateMembershipType']",
      ],
    },

    // -- /clients/{cid}: profile card + tab strip -----------------------------
    "patient-profile": {
      path: "/clients/{cid}",
      fingerprint: ["a[data-toggle=tab][href='#treatment-records']", ".profile-job"],
      elements: {
        profileCard: ".profile-job",
        tabTreatmentRecords: "a[data-toggle=tab][href='#treatment-records']",
        tabProfile: "a[data-toggle=tab][href='#client-profile']",
        tabAppointments: "a[data-toggle=tab][href='#appointments']",
        tabInvoice: "a[data-toggle=tab][href='#invoice']",
        historyLink: "a[href*='print-client-history']",
        lockLink: "a[href*='lock-treatment-records']",
        firstNameInput: "#client-profile input[name=first_name]",
        middleNameInput: "#client-profile input[name=middle_name]",
        lastNameInput: "#client-profile input[name=last_name]",
        nicknameInput: "#client-profile input[name=nickname]",
        emailInput: "#client-profile input[name=email]",
        mobileInput: "#client-profile input[name=mobile_no]",
        dobInput: "#client-profile input[name=dob]",
      },
      neverInteract: [
        "a[href*='consultations/create']",
        "a[href*='invoice/create']",
        "a[href*='lock-treatment-records']",
        "#client-profile button[type=submit]",
      ],
    },

    // -- Treatment Records tab: accordion of package panels ------------------
    "treatment-tab": {
      path: "/clients/{cid}#treatment-records",
      fingerprint: ["#treatment-records .session-accordion"],
      elements: {
        pane: "#treatment-records",
        accordion: "#treatment-records .session-accordion",
        panels: "#treatment-records .session-accordion > .panel",
        panelTitles: "#treatment-records .session-accordion .panel-title",
      },
    },

    // -- Invoice tab: AJAX DataTable (rows arrive after page load) -----------
    "invoice-tab": {
      path: "/clients/{cid}#invoice",
      fingerprint: ["#invoice #invoice-table"],
      elements: {
        table: "#invoice #invoice-table",
        rows: "#invoice #invoice-table tbody tr",
        emptyCell: "#invoice #invoice-table td.dataTables_empty",
        anyRow: "#invoice #invoice-table tbody tr, #invoice #invoice-table td.dataTables_empty",
      },
      neverInteract: ["#invoice a[href*='invoice/create']"],
    },

    // -- /invoice: the standalone list (same DataTable) ----------------------
    invoice: {
      path: "/invoice",
      fingerprint: ["#invoice-table"],
      elements: {
        table: "#invoice-table",
        rows: "#invoice-table tbody tr",
        emptyCell: "#invoice-table td.dataTables_empty",
        anyRow: "#invoice-table tbody tr, #invoice-table td.dataTables_empty",
      },
      neverInteract: ["a[href*='request_for_deletion']", "a[href*='invoice/create']"],
    },

    // -- Invoice detail view (reference photos; trigger unconfirmed) ---------
    "invoice-detail": {
      path: "/invoice/{ref}",
      fingerprint: [],
      elements: {
        anyTable: "table",
        detailTrigger: "td a",
      },
      neverInteract: [
        "a:has-text('Edit Payment Date')",
        "a:has-text('Delete Payment')",
        "button:has-text('New Payment')",
      ],
    },

    // -- /activity-logs: GET filter form + server-rendered table -------------
    "activity-log": {
      path: "/activity-logs",
      fingerprint: ["#activity-logs-table", "select[name='log_names[]']"],
      elements: {
        table: "#activity-logs-table",
        rows: "#activity-logs-table > tbody > tr",
        logNamesFilter: "select[name='log_names[]']",
        causersFilter: "select[name='causers[]']",
        fromInput: "input[name=from]",
        toInput: "input[name=to]",
        keywordInput: "input[name=search]",
        applyButton: ".panel-body .text-right button[type=submit]",
        paginationNext: "ul.pagination a[rel=next], ul.pagination a[aria-label*='Next']",
      },
    },
  },
};
