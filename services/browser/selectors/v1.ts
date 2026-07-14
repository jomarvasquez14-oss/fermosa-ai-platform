import type { PageId } from "@/services/browser/types";

/**
 * Selector map v1 â€” derived from the authoritative CRM reference captures
 * (docs/crm-reference/, local-only; studied 2026-07-14, extended with the
 * 2026-07-14 login/dashboard/patients re-captures â€” M0042A). Every selector
 * below was observed in a real export, INCLUDING login (capture landed
 * 2026-07-14; the M0041 provisional guesses were corrected in place â€” the
 * form has `input[name=email]`, no username/text input). Still unverified:
 * the invoice DETAIL view (no capture; capability below stays off).
 *
 * Versioning contract (ADR-031): the CRM has no versioned markup, so this map
 * is the version. A CRM redesign means a NEW map file (v2.ts), zero page-object
 * changes; every scraped record carries the active version in `sourceRef`.
 * M0042A was a non-breaking PATCH of v1: corrected selectors, same structure.
 */

export interface PageSelectors {
  /** The page's URL path in the CRM ("#fragment" marks a tab section). */
  path: string;
  /** Selectors that MUST be visible before parsing â€” layout-drift detection. */
  fingerprint: readonly string[];
  /** Named element selectors used by the page object. */
  elements: Readonly<Record<string, string>>;
  /**
   * Strongest evidence backing this page's selectors (M0042A):
   * "capture-replay" = executed against a real DOM capture by the
   * verify-captures harness; "capture" = derived from a capture but not
   * replay-executed; "unverified" = photos/guesses only. "live" arrives
   * with credentials.
   */
  verification: "capture-replay" | "capture" | "unverified";
  /**
   * Mutating controls observed on this page that automation must NEVER
   * touch (read-only contract, PROJECT_RULES #24). Documentation and
   * test material â€” page objects expose no operation that reaches these.
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
     * not attempt detail retrieval â€” invoice payments stay null.
     */
    invoiceDetail: false,
  },
  pages: {
    // -- /login: VERIFIED against the 2026-07-14 capture (M0042A) ------------
    // Laravel POST form with a hidden CSRF _token (the browser submits it
    // automatically). The "username" is an EMAIL field; there is no text
    // input. No CAPTCHA exists on the page (the seal badge is not one) â€”
    // the captcha probe stays as a defensive tripwire.
    login: {
      verification: "capture-replay",
      path: "/login",
      fingerprint: ["form input[name=email]", "input[type=password]"],
      elements: {
        username: "form input[name=email]",
        password: "input[name=password]",
        submit: "form button[type=submit]",
        captcha: "[class*=captcha], iframe[src*=captcha], .g-recaptcha",
      },
      neverInteract: ["input[name=remember]", "a[href*='password/reset']"],
    },

    // -- Dashboard: navbar/logout verified; modal reality corrected (M0042A).
    // The CRM has TWO blocking announcement modals, polled on every
    // authenticated page (announcements.js): #instant-announcement-modal
    // (re-shown every 5s, static backdrop) and #announcement-checklist-modal.
    // Their close buttons are attestations that POST mark-as-read â€” read-only
    // automation NEUTRALIZES the nodes client-side instead (see
    // pages/interstitials.ts) and never touches the controls below.
    dashboard: {
      verification: "capture-replay",
      path: "/",
      fingerprint: [".site-navbar"],
      elements: {
        userChrome: ".navbar-avatar",
        logoutButton: "form[action$='/logout'] button[type=submit]",
        patientsLink: "a[href$='/clients']",
        invoiceLink: "a[href$='/invoice']",
        activityLink: "a[href$='/activity-logs']",
        instantAnnouncementModal: "#instant-announcement-modal",
        checklistAnnouncementModal: "#announcement-checklist-modal",
        announcementModals: "#instant-announcement-modal, #announcement-checklist-modal",
      },
      neverInteract: [
        "#read-announcement",
        "#read-announcement-btn",
        "#mark-as-done-btn",
        "#completed-by",
      ],
    },

    // -- /clients: GET filter form + server-rendered dataTable ---------------
    "patient-search": {
      verification: "capture-replay",
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
      verification: "capture-replay",
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
      verification: "capture-replay",
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
      verification: "capture",
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
      verification: "capture",
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
      verification: "unverified",
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
    // M0042A: the log_names/causers selects are select2-enhanced â€” the NATIVE
    // select is permanently display:none on the live page, so it can never be
    // a fingerprint (or a wait target). Plain inputs stand in for the form.
    "activity-log": {
      verification: "capture-replay",
      path: "/activity-logs",
      // input[name=from] was removed from the fingerprint (M0049, live): the
      // Filters panel is `.panel.is-collapse` — its inputs exist in the DOM
      // but their VISIBILITY is decided by theme JS after load, so a
      // visible-wait fingerprint on them is a coin flip (passed in the
      // morning M0044 run, failed in the afternoon M0049 run). The table is
      // the page's stable, always-visible anchor.
      fingerprint: ["#activity-logs-table"],
      elements: {
        table: "#activity-logs-table",
        rows: "#activity-logs-table > tbody > tr",
        logNamesFilter: "select[name='log_names[]']",
        causersFilter: "select[name='causers[]']",
        fromInput: "input[name=from]",
        toInput: "input[name=to]",
        keywordInput: "input[name=search]",
        // Client-side collapse toggle of the Filters panel (live capture
        // 2026-07-14: `a[data-toggle=panel-collapse]` inside the filter
        // <form>) — a pure UI toggle, no request leaves the browser.
        filtersToggle: "form a[data-toggle='panel-collapse']",
        applyButton: ".panel-body .text-right button[type=submit]",
        paginationNext: "ul.pagination a[rel=next], ul.pagination a[aria-label*='Next']",
      },
    },
  },
};
