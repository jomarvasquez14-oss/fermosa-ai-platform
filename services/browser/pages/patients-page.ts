import type { TableCell } from "@/services/browser/driver/browser-driver";
import { LayoutChangedError } from "@/services/browser/types";
import { headerIndexMap, isEmptyTableResult, normalizeText } from "@/services/browser/utils/parse";
import { BasePage } from "./base-page";

/**
 * PatientsPage ("/clients") — search, results, pagination. The live form is
 * a GET filter offering NAME and MOBILE NUMBER (plus a last-visit range);
 * richer criteria (email, dob, crm id) do not exist server-side and are the
 * connector's responsibility (client-side refinement / direct profile
 * navigation). Row identity comes from the "View client" link's
 * `/clients/{cid}` href — names are search inputs, cid is identity.
 */

export interface PatientSearchInput {
  name?: string;
  mobile?: string;
}

export interface PatientRow {
  crmId: string;
  fullName: string;
  email: string | null;
  mobileNo: string | null;
  membershipType: string | null;
  lastVisit: string | null;
}

const RESULT_COLUMNS = ["NAME", "EMAIL", "MOBILE", "TYPE", "LAST VISIT"] as const;
const CID_PATTERN = /\/clients\/(\d+)/;

/**
 * The live CRM's search/filter runs a slow server-side query — observed to
 * exceed the driver's 10s action default, so the submit click (which auto-waits
 * on the results navigation) times out. Same class as the activity-log filter
 * (M0058); give the search the same longer budget.
 */
const SEARCH_TIMEOUT_MS = 30_000;

export class PatientsPage extends BasePage {
  readonly pageId = "patient-search" as const;

  /** Fill the filter form (empty string clears a field) and submit. */
  async search(input: PatientSearchInput): Promise<PatientRow[]> {
    await this.assertFingerprint();
    await this.driver.fill(this.sel("nameInput"), input.name ?? "");
    await this.driver.fill(this.sel("mobileInput"), input.mobile ?? "");
    await this.driver.click(this.sel("submit"), { timeoutMs: SEARCH_TIMEOUT_MS });
    await this.driver.waitFor(this.sel("resultsTable"), { timeoutMs: SEARCH_TIMEOUT_MS });
    return this.readResults();
  }

  /** Additional server-side filter the CRM offers: last-visit date range. */
  async filterByLastVisit(from: string, to: string): Promise<PatientRow[]> {
    await this.assertFingerprint();
    await this.driver.fill(this.sel("lastVisitFromInput"), from);
    await this.driver.fill(this.sel("lastVisitToInput"), to);
    await this.driver.click(this.sel("submit"), { timeoutMs: SEARCH_TIMEOUT_MS });
    await this.driver.waitFor(this.sel("resultsTable"), { timeoutMs: SEARCH_TIMEOUT_MS });
    return this.readResults();
  }

  /** The CRM's own Reset control — back to an unfiltered list. */
  async clearFilters(): Promise<void> {
    await this.driver.click(this.sel("resetLink"), { timeoutMs: SEARCH_TIMEOUT_MS });
    await this.driver.waitFor(this.sel("resultsTable"), { timeoutMs: SEARCH_TIMEOUT_MS });
  }

  async readResults(): Promise<PatientRow[]> {
    const table = await this.driver.table(this.sel("resultsTable"));
    if (isEmptyTableResult(table.rows)) return [];

    const columns = headerIndexMap(table.headers, RESULT_COLUMNS, "Patients list");
    return table.rows.map((cells, rowIndex) => {
      const crmId = this.rowCrmId(cells);
      if (!crmId) {
        throw new LayoutChangedError(
          `Patients list row ${rowIndex + 1} has no "View client" link with a /clients/{cid} href (${this.registry.version}).`
        );
      }
      return {
        crmId,
        fullName: normalizeText(cells[columns.NAME]?.text ?? ""),
        email: this.optional(cells[columns.EMAIL]?.text),
        mobileNo: this.optional(cells[columns.MOBILE]?.text),
        membershipType: this.optional(cells[columns.TYPE]?.text),
        lastVisit: this.optional(cells[columns["LAST VISIT"]]?.text),
      };
    });
  }

  async hasNextPage(): Promise<boolean> {
    return (await this.driver.locator(this.sel("paginationNext")).count()) > 0;
  }

  async nextPage(): Promise<PatientRow[]> {
    await this.driver.click(this.sel("paginationNext"), { timeoutMs: SEARCH_TIMEOUT_MS });
    await this.driver.waitFor(this.sel("resultsTable"), { timeoutMs: SEARCH_TIMEOUT_MS });
    return this.readResults();
  }

  /** Navigate to a patient's profile by its durable cid. */
  async openPatient(crmId: string): Promise<void> {
    const profilePath = this.registry.page("patient-profile").path.replace("{cid}", crmId);
    await this.driver.goto(profilePath);
  }

  private rowCrmId(cells: TableCell[]): string | null {
    for (const cell of cells) {
      for (const link of cell.links) {
        if (link.title === "View client" && link.href) {
          const match = link.href.match(CID_PATTERN);
          if (match?.[1]) return match[1];
        }
      }
    }
    return null;
  }

  private optional(text: string | undefined): string | null {
    const value = normalizeText(text ?? "");
    return value.length > 0 ? value : null;
  }
}
