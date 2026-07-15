/**
 * intake:check (M0061) — parse + validate a filled Transactions CSV (and an
 * optional Daily Summary CSV) and print the resulting canonical entries. This
 * is the end-to-end proof that a TYPED logbook plugs straight into the platform:
 * no API key, no network, fully deterministic.
 *
 * Usage:
 *   pnpm intake:check <transactions.csv> [--summary <daily-summary.csv>]
 */
import { existsSync, readFileSync } from "node:fs";
import { parseTransactions, parseSummary } from "@/services/intake/logbook-intake";
import { SUMMARY_HEADERS } from "@/services/intake/logbook-intake-schema";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function pad(value: string, width: number): string {
  return value.length > width ? value.slice(0, width - 1) + "…" : value.padEnd(width);
}

function main(): void {
  const txPath = process.argv[2];
  if (!txPath || txPath.startsWith("--")) {
    console.error("Usage: pnpm intake:check <transactions.csv> [--summary <daily-summary.csv>]");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(txPath)) {
    console.error(`Transactions file not found: ${txPath}`);
    process.exitCode = 1;
    return;
  }

  const { entries, rows, issues } = parseTransactions(readFileSync(txPath, "utf8"));

  console.log(`\nParsed ${entries.length} client entr${entries.length === 1 ? "y" : "ies"} from ${txPath}:\n`);
  console.log(
    `  ${pad("Line", 5)} ${pad("Patient", 26)} ${pad("Treatment", 24)} ${pad("Staff", 12)} ${pad("Time", 8)}`
  );
  console.log(`  ${"-".repeat(5)} ${"-".repeat(26)} ${"-".repeat(24)} ${"-".repeat(12)} ${"-".repeat(8)}`);
  for (const e of entries) {
    console.log(
      `  ${pad(String(e.lineNumber), 5)} ${pad(e.patientName ?? "—", 26)} ${pad(e.treatment ?? "—", 24)} ${pad(e.therapist ?? "—", 12)} ${pad(e.time ?? "—", 8)}`
    );
  }

  // Show the richer captured detail (services/meds/amounts) per client.
  console.log("\nCaptured detail:");
  for (const row of rows) {
    const svc = row.services.map((s) => `${s.name}${s.amount ? ` (${s.amount})` : ""}`).join(", ") || "—";
    const meds = row.meds.map((m) => `${m.name}${m.amount ? ` (${m.amount})` : ""}`).join(", ") || "—";
    console.log(`  #${row.lineNumber} ${row.clientName}: services=[${svc}] meds=[${meds}] cash=${row.cash ?? "—"} bank=${row.bank ?? "—"}`);
  }

  const summaryPath = arg("--summary");
  if (summaryPath) {
    if (!existsSync(summaryPath)) {
      console.error(`\nSummary file not found: ${summaryPath}`);
      process.exitCode = 1;
      return;
    }
    const { summary, issues: sIssues } = parseSummary(readFileSync(summaryPath, "utf8"));
    console.log(`\nDaily summary (${summaryPath}):`);
    if (summary) {
      for (const key of SUMMARY_HEADERS) {
        const value = summary[key];
        if (value !== null) console.log(`  ${key.padEnd(20)} ${value}`);
      }
    }
    issues.push(...sIssues);
  }

  if (issues.length > 0) {
    console.log(`\n⚠ ${issues.length} issue(s):`);
    for (const issue of issues) console.log(`  - ${issue}`);
    process.exitCode = 1;
  } else {
    console.log("\n✓ No issues — this sheet is ready for the audit pipeline.");
  }
}

main();
