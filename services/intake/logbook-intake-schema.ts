import { z } from "zod";

/**
 * Structured logbook intake schema (M0061) — the SINGLE contract shared by the
 * CSV template writer (`scripts/make-intake-template.ts`) and the parser
 * (`logbook-intake.ts`), so the column headers staff fill and the columns the
 * code reads can never drift.
 *
 * This is the "typed" input path: branches enter the daily logbook into a
 * spreadsheet instead of (or alongside) a photo. It mirrors the OCR field
 * vocabulary in `services/ai/ground-truth-schema.ts` — services/meds with
 * amounts, points BP/OP/NP — but as plain typed cells with NO confidence
 * wrappers, because a typed number is not a guess.
 *
 * A cell is the raw string a person typed. Blank ⇒ `null` (the value is absent
 * on that line). No `server-only`: these are plain files, parsed in a CLI.
 */

/** One cell as typed. The parser trims and maps blank ("") ⇒ null before validating. */
const cell = z.string().nullable();

/**
 * One row of the Transactions sheet = ONE service line. A client with several
 * services spans several rows sharing the same `lineNumber`; the per-client
 * scalars (name, times, cash, staff, points) are filled on the client's first
 * row and left blank on the continuation rows, exactly like the paper logbook.
 */
export const intakeTransactionRowSchema = z.object({
  date: cell,
  branch: cell,
  lineNumber: cell,
  clientName: cell,
  timeIn: cell,
  timeOut: cell,
  sessionNo: cell,
  service: cell,
  serviceAmount: cell,
  cash: cell,
  bank: cell,
  med: cell,
  medAmount: cell,
  staff: cell,
  bp: cell,
  op: cell,
  np: cell,
});
export type IntakeTransactionRow = z.infer<typeof intakeTransactionRowSchema>;

/** Column order for the Transactions sheet — matches the schema keys 1:1. */
export const TRANSACTION_HEADERS = [
  "date",
  "branch",
  "lineNumber",
  "clientName",
  "timeIn",
  "timeOut",
  "sessionNo",
  "service",
  "serviceAmount",
  "cash",
  "bank",
  "med",
  "medAmount",
  "staff",
  "bp",
  "op",
  "np",
] as const;

/**
 * The end-of-day rollup (the logbook's second page). Entered once per day as
 * field/value pairs. Parsed and stored for now; reconciling these totals
 * against CRM sums is a later financial-tally milestone (out of scope, M0061).
 */
export const intakeSummarySchema = z.object({
  date: cell,
  branch: cell,
  censusOld: cell,
  censusNew: cell,
  salesPS: cell,
  salesMC: cell,
  salesTS: cell,
  onlinePayment: cell,
  onlinePaymentMode: cell,
  commOvernight: cell,
  otherExpenses: cell,
  otherExpensesDetail: cell,
  totalExpenses: cell,
  totalCashClinic: cell,
  pettyCash: cell,
  medsSoaps: cell,
  thermotipsEye: cell,
  thermotipsFace: cell,
  thermotipsBody: cell,
  pointsBP: cell,
  pointsOP: cell,
  pointsNP: cell,
  keyHolder: cell,
  remarks: cell,
  ledgerCheckedBy: cell,
});
export type IntakeSummary = z.infer<typeof intakeSummarySchema>;

/** Field keys for the Daily Summary sheet — matches the schema keys 1:1. */
export const SUMMARY_HEADERS = [
  "date",
  "branch",
  "censusOld",
  "censusNew",
  "salesPS",
  "salesMC",
  "salesTS",
  "onlinePayment",
  "onlinePaymentMode",
  "commOvernight",
  "otherExpenses",
  "otherExpensesDetail",
  "totalExpenses",
  "totalCashClinic",
  "pettyCash",
  "medsSoaps",
  "thermotipsEye",
  "thermotipsFace",
  "thermotipsBody",
  "pointsBP",
  "pointsOP",
  "pointsNP",
  "keyHolder",
  "remarks",
  "ledgerCheckedBy",
] as const;

export type SummaryHeader = (typeof SUMMARY_HEADERS)[number];
