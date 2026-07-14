import { headerIndexMap, isEmptyTableResult, normalizeText } from "@/services/browser/utils/parse";
import { BasePage } from "./base-page";

/**
 * ActivityLogPage ("/activity-logs") — the CRM's edit history: filterable
 * (log names, causers, datetime range, keyword) and 100+ pages deep.
 * Retrieval is ALWAYS filtered and page-capped — never a full scan
 * (CRM_DISCOVERY §2). Field-level diffs live in nested tables inside the
 * "Details" / "Old Details" cells and are read per-row.
 */

export interface ActivityFilter {
  /** datetime-local, "yyyy-mm-ddThh:mm". */
  from?: string;
  to?: string;
  keyword?: string;
}

export interface RawActivityEntry {
  logName: string;
  description: string;
  causedBy: string;
  /** Verbatim CRM timestamp, "2026-07-13 18:32:52". */
  date: string;
  /** Field → new value (from "Details"). */
  details: Record<string, string>;
  /** Field → old value (from "Old Details"); empty for creations. */
  oldDetails: Record<string, string>;
}

const LOG_COLUMNS = ["Log Name", "Description", "Caused By", "Date"] as const;
const DETAILS_COLUMN = 7;
const OLD_DETAILS_COLUMN = 8;

export class ActivityLogPage extends BasePage {
  readonly pageId = "activity-log" as const;

  async applyFilter(filter: ActivityFilter): Promise<void> {
    await this.assertFingerprint();
    // The Filters panel is collapsible and its initial state is decided by
    // theme JS after load (M0049, live) — expand it deterministically before
    // touching its inputs. The toggle is client-side only: no request.
    if (!(await this.driver.isVisible(this.sel("fromInput")))) {
      await this.driver.click(this.sel("filtersToggle"));
      await this.driver.waitFor(this.sel("fromInput"), { state: "visible" });
    }
    await this.driver.fill(this.sel("fromInput"), filter.from ?? "");
    await this.driver.fill(this.sel("toInput"), filter.to ?? "");
    await this.driver.fill(this.sel("keywordInput"), filter.keyword ?? "");
    await this.driver.click(this.sel("applyButton"));
    await this.driver.waitFor(this.sel("table"));
  }

  async readEntries(): Promise<RawActivityEntry[]> {
    const table = await this.driver.table(this.sel("table"));
    // A patient with no matching activity renders the single-cell empty row —
    // parsing it as an entry yields an empty Date and a loud (but wrong)
    // failure downstream (observed live, M0049).
    if (isEmptyTableResult(table.rows)) return [];

    const columns = headerIndexMap(table.headers, LOG_COLUMNS, "Activity log");
    const entries: RawActivityEntry[] = [];

    for (let index = 0; index < table.rows.length; index++) {
      const cells = table.rows[index] ?? [];
      entries.push({
        logName: normalizeText(cells[columns["Log Name"]]?.text ?? ""),
        description: normalizeText(cells[columns.Description]?.text ?? ""),
        causedBy: normalizeText(cells[columns["Caused By"]]?.text ?? ""),
        date: normalizeText(cells[columns.Date]?.text ?? ""),
        details: await this.readDiffTable(index + 1, DETAILS_COLUMN),
        oldDetails: await this.readDiffTable(index + 1, OLD_DETAILS_COLUMN),
      });
    }
    return entries;
  }

  async hasNextPage(): Promise<boolean> {
    return (await this.driver.locator(this.sel("paginationNext")).count()) > 0;
  }

  async nextPage(): Promise<void> {
    await this.driver.click(this.sel("paginationNext"));
    await this.driver.waitFor(this.sel("table"));
  }

  /**
   * Filtered, page-capped retrieval — the workhorse for per-patient
   * discovery. `maxPages` is a hard budget: hitting it returns what was
   * gathered (the caller records partiality), it never keeps crawling.
   */
  async readFiltered(filter: ActivityFilter, maxPages: number): Promise<RawActivityEntry[]> {
    await this.applyFilter(filter);
    const entries: RawActivityEntry[] = [];
    for (let page = 0; page < maxPages; page++) {
      entries.push(...(await this.readEntries()));
      if (!(await this.hasNextPage())) break;
      if (page < maxPages - 1) await this.nextPage();
    }
    return entries;
  }

  /** Nested field/value table inside a Details or Old Details cell. */
  private async readDiffTable(
    rowNumber: number,
    columnNumber: number
  ): Promise<Record<string, string>> {
    const selector = `${this.sel("rows")}:nth-child(${rowNumber}) td:nth-child(${columnNumber}) table`;
    const tables = await this.driver.tables(selector);
    const diff: Record<string, string> = {};
    const nested = tables[0];
    if (!nested) return diff;
    for (const cells of nested.rows) {
      const field = normalizeText(cells[0]?.text ?? "");
      if (field) diff[field] = normalizeText(cells[1]?.text ?? "");
    }
    return diff;
  }
}
