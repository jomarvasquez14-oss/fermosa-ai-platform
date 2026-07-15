/**
 * intake:check (M0061 · workbook M0062) — parse + validate a filled logbook and
 * print the resulting canonical entries. The end-to-end proof that a TYPED
 * logbook plugs straight into the platform: no API key, no network, deterministic.
 *
 * Usage:
 *   pnpm intake:check <logbook.xlsx>                       (both tabs in one file)
 *   pnpm intake:check <transactions.csv> [--summary <daily-summary.csv>]
 */
import { existsSync, readFileSync } from "node:fs";
import {
  parseTransactions,
  parseTransactionsGrid,
  parseSummary,
  parseSummaryGrid,
  type TransactionsParseResult,
  type SummaryParseResult,
} from "@/services/intake/logbook-intake";
import { readIntakeWorkbook } from "@/services/intake/workbook";
import { SUMMARY_HEADERS } from "@/services/intake/logbook-intake-schema";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function pad(value: string, width: number): string {
  return value.length > width ? value.slice(0, width - 1) + "…" : value.padEnd(width);
}

/** Read the source (xlsx workbook or CSV) into parsed transactions + summary. */
async function load(
  source: string
): Promise<{ tx: TransactionsParseResult; summary: SummaryParseResult | null; issues: string[] }> {
  if (source.toLowerCase().endsWith(".xlsx")) {
    const wb = await readIntakeWorkbook(source);
    const tx = parseTransactionsGrid(wb.transactions);
    const summary = wb.summary.length > 0 ? parseSummaryGrid(wb.summary) : null;
    return { tx, summary, issues: wb.issues };
  }
  const tx = parseTransactions(readFileSync(source, "utf8"));
  const summaryPath = arg("--summary");
  let summary: SummaryParseResult | null = null;
  if (summaryPath) {
    if (!existsSync(summaryPath)) {
      return { tx, summary: null, issues: [`Summary file not found: ${summaryPath}`] };
    }
    summary = parseSummary(readFileSync(summaryPath, "utf8"));
  }
  return { tx, summary, issues: [] };
}

async function main(): Promise<void> {
  const source = process.argv[2];
  if (!source || source.startsWith("--")) {
    console.error(
      "Usage: pnpm intake:check <logbook.xlsx> | <transactions.csv> [--summary <daily-summary.csv>]"
    );
    process.exitCode = 1;
    return;
  }
  if (!existsSync(source)) {
    console.error(`File not found: ${source}`);
    process.exitCode = 1;
    return;
  }

  const { tx, summary, issues: loadIssues } = await load(source);
  const { entries, rows } = tx;
  const issues = [...loadIssues, ...tx.issues];

  console.log(`\nParsed ${entries.length} client entr${entries.length === 1 ? "y" : "ies"} from ${source}:\n`);
  console.log(
    `  ${pad("Line", 5)} ${pad("Patient", 26)} ${pad("Treatment", 24)} ${pad("Staff", 12)} ${pad("Time", 8)}`
  );
  console.log(`  ${"-".repeat(5)} ${"-".repeat(26)} ${"-".repeat(24)} ${"-".repeat(12)} ${"-".repeat(8)}`);
  for (const e of entries) {
    console.log(
      `  ${pad(String(e.lineNumber), 5)} ${pad(e.patientName ?? "—", 26)} ${pad(e.treatment ?? "—", 24)} ${pad(e.therapist ?? "—", 12)} ${pad(e.time ?? "—", 8)}`
    );
  }

  console.log("\nCaptured detail:");
  for (const row of rows) {
    const svc = row.services.map((s) => `${s.name}${s.amount ? ` (${s.amount})` : ""}`).join(", ") || "—";
    const meds = row.meds.map((m) => `${m.name}${m.amount ? ` (${m.amount})` : ""}`).join(", ") || "—";
    console.log(`  #${row.lineNumber} ${row.clientName}: services=[${svc}] meds=[${meds}] cash=${row.cash ?? "—"} bank=${row.bank ?? "—"}`);
  }

  if (summary) {
    console.log("\nDaily summary:");
    if (summary.summary) {
      for (const key of SUMMARY_HEADERS) {
        const value = summary.summary[key];
        if (value !== null) console.log(`  ${key.padEnd(20)} ${value}`);
      }
    }
    issues.push(...summary.issues);
  }

  if (issues.length > 0) {
    console.log(`\n⚠ ${issues.length} issue(s):`);
    for (const issue of issues) console.log(`  - ${issue}`);
    process.exitCode = 1;
  } else {
    console.log("\n✓ No issues — this sheet is ready for the audit pipeline.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
