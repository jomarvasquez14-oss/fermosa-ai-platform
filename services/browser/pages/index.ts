import type { BrowserDriver } from "@/services/browser/driver/browser-driver";
import type { SelectorRegistry } from "@/services/browser/selectors";
import type { NavigablePageId } from "@/services/browser/types";
import { ActivityLogPage } from "./activity-log-page";
import { BasePage } from "./base-page";
import { DashboardPage } from "./dashboard-page";
import { LoginPage } from "./login-page";
import { PatientProfilePage } from "./patient-profile-page";
import { PatientsPage } from "./patients-page";

export { BasePage } from "./base-page";
export { LoginPage } from "./login-page";
export { DashboardPage } from "./dashboard-page";
export { PatientsPage, type PatientRow, type PatientSearchInput } from "./patients-page";
export {
  PatientProfilePage,
  PROFILE_TABS,
  type PatientDemographics,
  type ProfileTab,
} from "./patient-profile-page";
export { TreatmentTab, type RawTreatmentPackage, type RawTreatmentRow } from "./treatment-tab";
export {
  InvoiceTab,
  type RawInvoiceDetail,
  type RawInvoicePayment,
  type RawInvoiceRow,
} from "./invoice-tab";
export { ActivityLogPage, type ActivityFilter, type RawActivityEntry } from "./activity-log-page";

/**
 * The standalone "/invoice" list page. Discovery reads invoices through the
 * patient profile's Invoice tab (already patient-scoped); this page exists
 * for navigation/fingerprint coverage of the route itself.
 */
export class InvoicePage extends BasePage {
  readonly pageId = "invoice" as const;
}

type PageConstructor = new (driver: BrowserDriver, registry: SelectorRegistry) => BasePage;

/** Navigable routes only — tabs are reached through PatientProfilePage. */
export const PAGE_CLASSES: Record<NavigablePageId, PageConstructor> = {
  login: LoginPage,
  dashboard: DashboardPage,
  "patient-search": PatientsPage,
  "patient-profile": PatientProfilePage,
  invoice: InvoicePage,
  "activity-log": ActivityLogPage,
};
