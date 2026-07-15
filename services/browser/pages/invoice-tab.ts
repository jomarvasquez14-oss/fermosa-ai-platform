import { LayoutChangedError } from "@/services/browser/types";
import { headerIndexMap, isEmptyTableResult, normalizeText } from "@/services/browser/utils/parse";
import { BasePage } from "./base-page";

/**
 * InvoiceTab — the profile's Invoice tab: an AJAX DataTable whose rows
 * arrive AFTER page load (`waitForData` handles both "rows present" and the
 * DataTables empty cell). Status literals are the CRM's own filter options:
 * NOT PAID / PARTIALLY PAID / FULLY PAID / CANCELLED.
 *
 * The invoice DETAIL (services + full payment history) is NOT a separate page:
 * the CRM embeds it, per row, as a base64-encoded JSON `data-details`
 * attribute on each `<tr>` (verified live, M0056). Reading it is strictly
 * READ-ONLY — the data is already in the list DOM; no click, no navigation, no
 * detail request. `readInvoiceDetails` decodes it and is gated behind the
 * `invoiceDetail` capability (v1: on since M0056).
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
  /** "57 Clouie Mondragon" — staff id + name, split by the normalizer. */
  receivedBy: string | null;
  /** Derived from deleted_at / request_for_deletion: completed | cancellation-requested | cancelled. */
  status: string;
}

export interface RawInvoiceDetail {
  services: Array<{ service: string; description: string | null }>;
  payments: RawInvoicePayment[];
}

/** The subset of the embedded `data-details` JSON we read (READ-ONLY). */
interface EmbeddedInvoiceDetail {
  ref_no?: string | number | null;
  items?: Array<{ service_name?: string | null; description?: string | null }> | null;
  payments?: Array<{
    date_paid?: string | null;
    prn?: string | null;
    amount_paid?: number | string | null;
    payment_type?: string | null;
    service_name?: string | null;
    remarks?: string | null;
    received_by?: string | null;
    deleted_at?: string | null;
    request_for_deletion?: number | boolean | null;
  }> | null;
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

function toOptional(text: string | null | undefined): string | null {
  const value = normalizeText(String(text ?? ""));
  return value.length > 0 && value !== "-" ? value : null;
}

function paymentStatus(payment: NonNullable<EmbeddedInvoiceDetail["payments"]>[number]): string {
  if (payment.deleted_at) return "cancelled";
  if (payment.request_for_deletion) return "cancellation-requested";
  return "completed";
}

/**
 * PURE decoder (M0056): each entry is one row's base64 `data-details` JSON.
 * Returns a map keyed by the invoice's ref_no. Unparseable / detail-less
 * entries are skipped (the list columns still carry the invoice). Cancelled
 * and deletion-requested payments are INCLUDED with a `status` so an audit
 * sees reversed money, not a silently shorter history.
 */
export function decodeInvoiceDetails(encoded: (string | null)[]): Map<string, RawInvoiceDetail> {
  const map = new Map<string, RawInvoiceDetail>();
  for (const raw of encoded) {
    if (!raw) continue;
    let parsed: EmbeddedInvoiceDetail;
    try {
      parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as EmbeddedInvoiceDetail;
    } catch {
      continue;
    }
    const refNo = normalizeText(String(parsed.ref_no ?? ""));
    if (!refNo) continue;
    const services = (parsed.items ?? []).map((item) => ({
      service: normalizeText(String(item.service_name ?? "")),
      description: toOptional(item.description),
    }));
    const payments: RawInvoicePayment[] = (parsed.payments ?? []).map((payment) => ({
      date: normalizeText(String(payment.date_paid ?? "")),
      referenceNo: toOptional(payment.prn),
      amountPaid: normalizeText(String(payment.amount_paid ?? "")),
      method: toOptional(payment.payment_type),
      service: toOptional(payment.service_name),
      remarks: toOptional(payment.remarks),
      receivedBy: toOptional(payment.received_by),
      status: paymentStatus(payment),
    }));
    map.set(refNo, { services, payments });
  }
  return map;
}

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
   * Read every invoice's embedded detail (services + full payment history)
   * from the list rows' base64 `data-details` attributes — keyed by ref_no.
   * READ-ONLY: the data is already in the DOM; nothing is clicked or navigated.
   * Returns an empty map when the table is empty.
   */
  async readInvoiceDetails(): Promise<Map<string, RawInvoiceDetail>> {
    await this.waitForData();
    const encoded = await this.driver.locator(this.sel("rows")).attrs("data-details");
    return decodeInvoiceDetails(encoded);
  }
}
