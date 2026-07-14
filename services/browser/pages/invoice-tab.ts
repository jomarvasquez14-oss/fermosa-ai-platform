import type { TableData } from "@/services/browser/driver/browser-driver";
import { LayoutChangedError } from "@/services/browser/types";
import { headerIndexMap, isEmptyTableResult, normalizeText } from "@/services/browser/utils/parse";
import { BasePage } from "./base-page";

/**
 * InvoiceTab — the profile's Invoice tab: an AJAX DataTable whose rows
 * arrive AFTER page load (`waitForData` handles both "rows present" and the
 * DataTables empty cell). Status literals are the CRM's own filter options:
 * NOT PAID / PARTIALLY PAID / FULLY PAID / CANCELLED.
 *
 * The invoice DETAIL view (SERVICES + PAYMENTS tables, per the reference
 * photos) is parsed structurally — tables are classified by their headers,
 * not by CSS, because the detail markup was never captured. Reaching the
 * detail is gated behind the `invoiceDetail` capability flag until the
 * trigger is confirmed live (v1: off).
 */

export interface RawInvoiceRow {
  refNo: string;
  serviceName: string;
  amount: string;
  amountPaid: string;
  balance: string;
  /** Verbatim CRM literal, e.g. "PARTIALLY PAID". */
  statusLiteral: string;
  dateUpdated: string;
}

export interface RawInvoicePayment {
  date: string;
  referenceNo: string | null;
  amountPaid: string;
  method: string | null;
  service: string | null;
  remarks: string | null;
  /** "102 Remelee Pulma" — staff id + name, split by the normalizer. */
  receivedBy: string | null;
}

export interface RawInvoiceDetail {
  services: Array<{ service: string; description: string | null }>;
  payments: RawInvoicePayment[];
}

const LIST_COLUMNS = [
  "REF NO",
  "SERVICE NAME",
  "AMOUNT",
  "AMOUNT PAID",
  "BALANCE",
  "DATE UPDATED",
  "STATUS",
] as const;

const PAYMENT_COLUMNS = ["DATE", "REFERENCE NO.", "AMOUNT PAID", "PAYMENT METHOD"] as const;

export class InvoiceTab extends BasePage {
  readonly pageId = "invoice-tab" as const;

  /** Wait for the AJAX table to settle: data rows or the explicit empty cell. */
  async waitForData(): Promise<void> {
    await this.driver.waitFor(this.sel("anyRow"), { state: "attached" });
  }

  async readInvoices(): Promise<RawInvoiceRow[]> {
    await this.assertFingerprint();
    await this.waitForData();

    const table = await this.driver.table(this.sel("table"));
    if (isEmptyTableResult(table.rows)) return [];

    const columns = headerIndexMap(table.headers, LIST_COLUMNS, "Invoice list");
    return table.rows.map((cells, rowIndex) => {
      const refNo = normalizeText(cells[columns["REF NO"]]?.text ?? "");
      if (!refNo) {
        throw new LayoutChangedError(
          `Invoice list row ${rowIndex + 1} has an empty REF NO (${this.registry.version}).`
        );
      }
      return {
        refNo,
        serviceName: normalizeText(cells[columns["SERVICE NAME"]]?.text ?? ""),
        amount: normalizeText(cells[columns.AMOUNT]?.text ?? ""),
        amountPaid: normalizeText(cells[columns["AMOUNT PAID"]]?.text ?? ""),
        balance: normalizeText(cells[columns.BALANCE]?.text ?? ""),
        statusLiteral: normalizeText(cells[columns.STATUS]?.text ?? ""),
        dateUpdated: normalizeText(cells[columns["DATE UPDATED"]]?.text ?? ""),
      };
    });
  }

  /**
   * Parse an OPEN invoice detail view. Tables are classified by headers:
   * SERVICE+DESCRIPTION = services, DATE+REFERENCE NO.+AMOUNT PAID+... =
   * payments (multiple rows = installments — partial payments are a main
   * path, not an edge case). No payments table = layout drift, loud.
   */
  async readDetail(): Promise<RawInvoiceDetail> {
    const tables = await this.driver.tables(this.registry.selector("invoice-detail", "anyTable"));

    const services: RawInvoiceDetail["services"] = [];
    let payments: RawInvoicePayment[] | null = null;

    for (const table of tables) {
      if (this.matchesHeaders(table, ["SERVICE", "DESCRIPTION"])) {
        for (const cells of table.rows) {
          const service = normalizeText(cells[0]?.text ?? "");
          if (service) services.push({ service, description: this.optional(cells[1]?.text) });
        }
        continue;
      }
      if (this.matchesHeaders(table, PAYMENT_COLUMNS)) {
        const columns = headerIndexMap(table.headers, PAYMENT_COLUMNS, "Invoice payments");
        const received = this.headerIndex(table, "RECEIVED BY");
        const service = this.headerIndex(table, "SERVICE");
        const remarks = this.headerIndex(table, "REMARKS");
        payments = table.rows.map((cells) => ({
          date: normalizeText(cells[columns.DATE]?.text ?? ""),
          referenceNo: this.optional(cells[columns["REFERENCE NO."]]?.text),
          amountPaid: normalizeText(cells[columns["AMOUNT PAID"]]?.text ?? ""),
          method: this.optional(cells[columns["PAYMENT METHOD"]]?.text),
          service: service === null ? null : this.optional(cells[service]?.text),
          remarks: remarks === null ? null : this.optional(cells[remarks]?.text),
          receivedBy: received === null ? null : this.optional(cells[received]?.text),
        }));
      }
    }

    if (payments === null) {
      throw new LayoutChangedError(
        `Invoice detail: no table with columns ${PAYMENT_COLUMNS.join(", ")} was found ` +
          `(${this.registry.version}). Never silently continue — the map needs review.`
      );
    }
    return { services, payments };
  }

  private matchesHeaders(table: TableData, required: readonly string[]): boolean {
    const headers = table.headers.map((header) => normalizeText(header).toUpperCase());
    return required.every((name) => headers.includes(name.toUpperCase()));
  }

  private headerIndex(table: TableData, name: string): number | null {
    const index = table.headers.findIndex(
      (header) => normalizeText(header).toUpperCase() === name.toUpperCase()
    );
    return index === -1 ? null : index;
  }

  private optional(text: string | null | undefined): string | null {
    const value = normalizeText(text ?? "");
    return value.length > 0 && value !== "-" ? value : null;
  }
}
