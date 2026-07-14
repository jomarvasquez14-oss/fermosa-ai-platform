import {
  LayoutChangedError,
  normalizeText,
  parseMoney,
  toIsoDate,
  toIsoDateTime,
  type PatientDemographics,
  type PatientRow,
  type RawActivityEntry,
  type RawInvoiceDetail,
  type RawInvoiceRow,
  type RawTreatmentPackage,
} from "@/services/browser";
import type {
  NormalizedCrmPatientRecord,
  PatientSummary,
  RetrievalWindow,
} from "@/services/crm/types";

/**
 * Normalization (ADR-027 §3): browser page output → the ONE shape consumers
 * see. Pure functions — no driver, no session. Anything unparseable fails
 * loudly as CRM_LAYOUT: silently wrong money or dates would poison every
 * downstream comparison, and absence is already representable (null).
 */

/** The CRM's own status filter literals → normalized lowercase statuses. */
const STATUS_LITERALS: Record<string, string> = {
  "NOT PAID": "unpaid",
  "PARTIALLY PAID": "partial",
  "FULLY PAID": "paid",
  PAID: "paid",
  CANCELLED: "cancelled",
};

export function normalizeStatus(literal: string): string {
  const key = normalizeText(literal).toUpperCase();
  return STATUS_LITERALS[key] ?? key.toLowerCase();
}

/** List rows carry no DOB — summaries from search have `dateOfBirth: null`. */
export function toPatientSummary(row: PatientRow): PatientSummary {
  return {
    crmId: row.crmId,
    fullName: row.fullName,
    dateOfBirth: null,
    mobileNo: row.mobileNo,
    membershipType: row.membershipType,
    lastVisit: toIsoDate(row.lastVisit),
  };
}

export interface RawPatientRecord {
  crmId: string;
  fullName: string;
  demographics: PatientDemographics;
  locked: boolean;
  packages: RawTreatmentPackage[];
  invoices: RawInvoiceRow[];
  /** Keyed by refNo; only present when the detail capability is on. */
  invoiceDetails: Map<string, RawInvoiceDetail>;
  activity: RawActivityEntry[];
}

function inWindow(dateIso: string, window?: RetrievalWindow): boolean {
  if (!window) return true;
  const day = dateIso.slice(0, 10);
  return day >= window.from && day <= window.to;
}

function requireMoney(value: string, what: string): string {
  const money = parseMoney(value);
  if (money === null) {
    throw new LayoutChangedError(`${what}: "${value}" is not a parseable amount.`);
  }
  return money;
}

function requireDate(value: string, what: string): string {
  const date = toIsoDate(value);
  if (date === null) {
    throw new LayoutChangedError(`${what}: "${value}" is not a parseable date.`);
  }
  return date;
}

function activityChanges(
  entry: RawActivityEntry
): Array<{ field: string; oldValue: string | null; newValue: string | null }> | null {
  const fields = [...new Set([...Object.keys(entry.details), ...Object.keys(entry.oldDetails)])];
  if (fields.length === 0) return null;
  return fields.map((field) => ({
    field,
    oldValue: entry.oldDetails[field] ?? null,
    newValue: entry.details[field] ?? null,
  }));
}

/**
 * Assemble the normalized record (schema validation happens at the connector
 * boundary, mirroring the mock). `sourceRef` carries the selector-map version
 * plus the patient path — reproducibility without PII.
 */
export function buildNormalizedRecord(
  raw: RawPatientRecord,
  window: RetrievalWindow | undefined,
  provenance: { selectorVersion: string }
): NormalizedCrmPatientRecord {
  const treatments = raw.packages.flatMap((pkg) =>
    pkg.rows
      .filter((row) => inWindow(row.date, window))
      .map((row) => ({
        performedAt: row.date,
        branch: {
          crmBranchId: row.crmBranchId ?? "",
          name: row.branchName ?? "Unknown",
          platformBranchId: null,
        },
        procedure: row.procedure,
        packageName: pkg.packageName || null,
        // Row order within a panel is not a reliable session ordinal — the
        // panel title's "(done/total)" gives totals only.
        sessionNumber: null,
        sessionsTotal: pkg.sessionsTotal,
        promoCode: row.promoCode,
        intensitySettings: row.intensitySettings,
        // USER-column semantics (aesthetician vs encoder) are still the §3
        // open question — never guess a role.
        performedBy: { name: row.performedBy ?? "Unknown", role: "unknown" as const },
        locked: raw.locked,
      }))
  );

  const invoices = raw.invoices
    .map((row) => ({
      refNo: row.refNo,
      serviceName: row.serviceName,
      amount: requireMoney(row.amount, `Invoice ${row.refNo} AMOUNT`),
      amountPaid: requireMoney(row.amountPaid, `Invoice ${row.refNo} AMOUNT PAID`),
      balance: requireMoney(row.balance, `Invoice ${row.refNo} BALANCE`),
      status: normalizeStatus(row.statusLiteral),
      dateUpdated: requireDate(row.dateUpdated, `Invoice ${row.refNo} DATE UPDATED`),
      payments: toPayments(raw.invoiceDetails.get(row.refNo)),
    }))
    .filter((invoice) => inWindow(invoice.dateUpdated, window));

  const activity = raw.activity
    .map((entry) => ({
      occurredAt:
        toIsoDateTime(entry.date) ?? requireDate(entry.date, "Activity log Date") + "T00:00:00",
      logName: entry.logName,
      description: entry.description,
      causedBy: entry.causedBy,
      changes: activityChanges(entry),
    }))
    .filter((entry) => inWindow(entry.occurredAt, window));

  return {
    retrievedAt: new Date().toISOString(),
    connectorKind: "browser-automation",
    sourceRef: `${provenance.selectorVersion} /clients/${raw.crmId}`,
    patient: {
      crmId: raw.crmId,
      fullName: raw.fullName,
      firstName: raw.demographics.firstName,
      middleName: raw.demographics.middleName,
      lastName: raw.demographics.lastName,
      nickname: raw.demographics.nickname,
      dateOfBirth: raw.demographics.dateOfBirth,
      email: raw.demographics.email,
      mobileNo: raw.demographics.mobileNo,
      // Not shown on the profile page — only the list's TYPE column has it.
      membershipType: null,
      lastVisit: null,
    },
    treatments,
    invoices,
    activity,
  };
}

function toPayments(
  detail: RawInvoiceDetail | undefined
): NormalizedCrmPatientRecord["invoices"][number]["payments"] {
  if (!detail) return null;
  return detail.payments.map((payment) => ({
    paidAt: requireDate(payment.date, "Invoice payment DATE"),
    amount: requireMoney(payment.amountPaid, "Invoice payment AMOUNT PAID"),
    mode: payment.method ?? "",
    receivedBy: payment.receivedBy ?? "",
    referenceNo: payment.referenceNo,
  }));
}
