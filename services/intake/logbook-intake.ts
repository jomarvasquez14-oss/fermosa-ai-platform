import type { ConfirmedEntry } from "@/services/rules";
import { parseCsv, isBlankRow } from "./csv";
import {
  intakeTransactionRowSchema,
  intakeSummarySchema,
  TRANSACTION_HEADERS,
  SUMMARY_HEADERS,
  type IntakeSummary,
} from "./logbook-intake-schema";

/**
 * Structured logbook intake parser (M0061) — pure, no IO. Turns a filled
 * Transactions CSV into the platform's canonical `ConfirmedEntry[]` (the exact
 * shape the OCR path produces), so typed data flows through the SAME matching +
 * rule engine with no API call. Also parses the Daily Summary CSV into a typed
 * object (stored/echoed for now; reconciliation is a later milestone).
 *
 * Errors are returned as `issues`, never thrown — mirrors `validateGroundTruth`.
 */

export interface IntakeLineItem {
  name: string | null;
  amount: string | null;
}

/** One client's full logbook line — richer than `ConfirmedEntry`, kept for the
 *  later financial-tally milestone (amounts, meds, cash/bank, points). */
export interface StructuredEntry {
  date: string | null;
  branch: string | null;
  lineNumber: number;
  clientName: string | null;
  timeIn: string | null;
  timeOut: string | null;
  sessionNo: string | null;
  services: IntakeLineItem[];
  meds: IntakeLineItem[];
  cash: string | null;
  bank: string | null;
  staff: string | null;
  points: { bp: string | null; op: string | null; np: string | null };
}

export interface TransactionsParseResult {
  entries: ConfirmedEntry[];
  rows: StructuredEntry[];
  issues: string[];
}

export interface SummaryParseResult {
  summary: IntakeSummary | null;
  issues: string[];
}

/** Trim; empty ⇒ null (the value is absent on that line). */
function normCell(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Strip peso signs and thousands separators from a typed amount, keeping the
 *  bare number as text ("₱1,549" → "1549"). Mirrors `normalizeValue` in
 *  services/ai/calibration/score.ts, kept local so intake owns no OCR deps. */
function normAmount(value: string | null): string | null {
  if (value === null) return null;
  const stripped = value.replace(/[₱,\s]/g, "");
  return stripped === "" ? null : stripped;
}

/** Map a header row to column indexes; reports any missing required headers. */
function indexHeaders(
  header: string[],
  required: readonly string[]
): { map: Map<string, number>; issues: string[] } {
  const map = new Map<string, number>();
  header.forEach((name, col) => map.set(name.trim(), col));
  const issues = required
    .filter((name) => !map.has(name))
    .map((name) => `Missing required column "${name}" in header row.`);
  return { map, issues };
}

/**
 * Parse a filled Transactions CSV. Rows sharing (date, branch, lineNumber) are
 * one client: per-client scalars come from the group's first row; service/med
 * lines accumulate across the group's rows.
 */
export function parseTransactions(csv: string): TransactionsParseResult {
  return parseTransactionsGrid(parseCsv(csv));
}

/** As `parseTransactions`, but from an already-read grid (a CSV or an xlsx sheet). */
export function parseTransactionsGrid(grid: string[][]): TransactionsParseResult {
  const issues: string[] = [];
  if (grid.length === 0) {
    return { entries: [], rows: [], issues: ["File is empty."] };
  }

  const { map, issues: headerIssues } = indexHeaders(grid[0]!, TRANSACTION_HEADERS);
  issues.push(...headerIssues);
  if (headerIssues.length > 0) {
    return { entries: [], rows: [], issues };
  }

  const cellAt = (row: string[], key: (typeof TRANSACTION_HEADERS)[number]): string | null =>
    normCell(row[map.get(key)!]);

  // Preserve first-seen order of clients while grouping their service rows.
  const order: string[] = [];
  const groups = new Map<string, { first: number; rows: string[][] }>();

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r]!;
    if (isBlankRow(row)) continue;

    // Validate the row shape (all cells are strings-or-blank by construction;
    // this also documents the contract and catches a ragged/extra-column row).
    const record = Object.fromEntries(
      TRANSACTION_HEADERS.map((key) => [key, cellAt(row, key)])
    );
    const parsed = intakeTransactionRowSchema.safeParse(record);
    if (!parsed.success) {
      issues.push(`Row ${r + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }

    const key = `${cellAt(row, "date") ?? ""}||${cellAt(row, "branch") ?? ""}||${
      cellAt(row, "lineNumber") ?? ""
    }`;
    let group = groups.get(key);
    if (!group) {
      group = { first: r + 1, rows: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.rows.push(row);
  }

  const entries: ConfirmedEntry[] = [];
  const rows: StructuredEntry[] = [];

  for (const key of order) {
    const group = groups.get(key)!;
    const head = group.rows[0]!;
    const at = (k: (typeof TRANSACTION_HEADERS)[number]) => cellAt(head, k);

    const rawLine = at("lineNumber");
    const lineNumber = Number(rawLine);
    if (rawLine === null || !Number.isInteger(lineNumber) || lineNumber < 1) {
      issues.push(`Row ${group.first}: lineNumber must be a whole number ≥ 1 (got "${rawLine ?? ""}").`);
      continue;
    }

    const clientName = at("clientName");
    if (clientName === null) {
      issues.push(`Row ${group.first}: clientName is required.`);
      continue;
    }

    const services: IntakeLineItem[] = [];
    const meds: IntakeLineItem[] = [];
    for (const row of group.rows) {
      const service = cellAt(row, "service");
      if (service !== null) {
        services.push({ name: service, amount: normAmount(cellAt(row, "serviceAmount")) });
      }
      const med = cellAt(row, "med");
      if (med !== null) {
        meds.push({ name: med, amount: normAmount(cellAt(row, "medAmount")) });
      }
      // A continuation row that repeats a DIFFERENT client name is a likely
      // mis-keyed lineNumber — worth surfacing, not silently merging.
      const rowName = cellAt(row, "clientName");
      if (rowName !== null && rowName !== clientName) {
        issues.push(
          `Row ${group.first}: clientName "${rowName}" differs from "${clientName}" for the same line ${lineNumber} — check the lineNumber.`
        );
      }
    }

    const structured: StructuredEntry = {
      date: at("date"),
      branch: at("branch"),
      lineNumber,
      clientName,
      timeIn: at("timeIn"),
      timeOut: at("timeOut"),
      sessionNo: at("sessionNo"),
      services,
      meds,
      cash: normAmount(at("cash")),
      bank: normAmount(at("bank")),
      staff: at("staff"),
      points: {
        bp: normAmount(at("bp")),
        op: normAmount(at("op")),
        np: normAmount(at("np")),
      },
    };
    rows.push(structured);

    // Down-map to the canonical ConfirmedEntry — the SAME convention the OCR
    // matching-executor uses: primary service → treatment, staff → therapist,
    // timeIn → time. No image, so imageId is a synthetic sheet reference.
    entries.push({
      imageId: `sheet:${structured.date ?? "?"}:${structured.branch ?? "?"}`,
      pageNumber: 1,
      lineNumber,
      patientName: clientName,
      treatment: services[0]?.name ?? null,
      therapist: structured.staff,
      time: structured.timeIn,
    });
  }

  return { entries, rows, issues };
}

/**
 * Parse a Daily Summary CSV of `field,value` rows into a typed summary object.
 * Unknown fields are reported; missing known fields default to null.
 */
export function parseSummary(csv: string): SummaryParseResult {
  return parseSummaryGrid(parseCsv(csv));
}

/** As `parseSummary`, but from an already-read grid (a CSV or an xlsx sheet). */
export function parseSummaryGrid(grid: string[][]): SummaryParseResult {
  const issues: string[] = [];
  const known = new Set<string>(SUMMARY_HEADERS);
  const collected: Record<string, string | null> = {};

  const startRow =
    grid.length > 0 && grid[0]![0]?.trim().toLowerCase() === "field" ? 1 : 0;

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r]!;
    if (isBlankRow(row)) continue;
    const field = normCell(row[0]);
    if (field === null) continue;
    if (!known.has(field)) {
      issues.push(`Row ${r + 1}: unknown summary field "${field}" (ignored).`);
      continue;
    }
    collected[field] = normCell(row[1]);
  }

  const record = Object.fromEntries(
    SUMMARY_HEADERS.map((key) => [key, collected[key] ?? null])
  );
  const parsed = intakeSummarySchema.safeParse(record);
  if (!parsed.success) {
    return {
      summary: null,
      issues: [...issues, ...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)],
    };
  }
  return { summary: parsed.data, issues };
}
