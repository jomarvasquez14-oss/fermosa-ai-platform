import { LayoutChangedError } from "@/services/browser/types";
import {
  headerIndexMap,
  normalizeText,
  parsePackageTitle,
  toIsoDate,
} from "@/services/browser/utils/parse";
import { BasePage } from "./base-page";

/**
 * TreatmentTab — the profile's Treatment Records accordion: one panel per
 * availed package ("CARBON LASER 5+1 (7/10) completed"), each holding a
 * session-granular table. Cell data lives inside the CRM's own readonly
 * inputs / disabled selects, which `driver.table()` captures as values and
 * selected labels; the BRANCH select's option value is the CRM branch id.
 */

export interface RawTreatmentRow {
  /** yyyy-mm-dd */
  date: string;
  crmBranchId: string | null;
  branchName: string | null;
  promoCode: string | null;
  procedure: string;
  intensitySettings: string | null;
  performedBy: string | null;
}

export interface RawTreatmentPackage {
  packageName: string;
  sessionsDone: number | null;
  sessionsTotal: number | null;
  rows: RawTreatmentRow[];
}

const TREATMENT_COLUMNS = [
  "DATE",
  "BRANCH",
  "PROMO CODE",
  "PROCEDURE",
  "INTENSITY SETTINGS",
  "USER",
] as const;

export class TreatmentTab extends BasePage {
  readonly pageId = "treatment-tab" as const;

  /** Parse every package panel. Rows are in the DOM even while collapsed. */
  async read(): Promise<RawTreatmentPackage[]> {
    await this.assertFingerprint();

    const titles = await this.driver.locator(this.sel("panelTitles")).texts();
    const packages: RawTreatmentPackage[] = [];

    for (let index = 0; index < titles.length; index++) {
      const { packageName, sessionsDone, sessionsTotal } = parsePackageTitle(titles[index] ?? "");
      const table = await this.driver.table(`${this.sel("panels")}:nth-child(${index + 1}) table`);
      const columns = headerIndexMap(
        table.headers,
        TREATMENT_COLUMNS,
        `Treatment package "${packageName}"`
      );

      const rows = table.rows.map((cells, rowIndex) => {
        const date = toIsoDate(cells[columns.DATE]?.value);
        const procedure = normalizeText(cells[columns.PROCEDURE]?.value ?? "");
        if (!date || !procedure) {
          throw new LayoutChangedError(
            `Treatment package "${packageName}" row ${rowIndex + 1}: missing ` +
              `${!date ? "DATE" : "PROCEDURE"} value (${this.registry.version}).`
          );
        }
        return {
          date,
          crmBranchId: this.optional(cells[columns.BRANCH]?.value),
          branchName: this.optional(cells[columns.BRANCH]?.selectedLabel),
          promoCode: this.optional(cells[columns["PROMO CODE"]]?.value),
          procedure,
          intensitySettings: this.optional(cells[columns["INTENSITY SETTINGS"]]?.value),
          performedBy: this.optional(cells[columns.USER]?.selectedLabel),
        };
      });

      packages.push({ packageName, sessionsDone, sessionsTotal, rows });
    }

    return packages;
  }

  private optional(value: string | null | undefined): string | null {
    const text = normalizeText(value ?? "");
    if (text.length === 0) return null;
    // Selects render a "-- Select a User --" placeholder when nothing is set.
    if (/^--.*--$/.test(text)) return null;
    return text;
  }
}
