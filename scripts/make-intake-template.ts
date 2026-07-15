/**
 * intake:template (M0061) — write the blank CSV templates branches fill, a
 * worked example, and plain-language instructions to templates/logbook-intake/.
 *
 * The templates' headers come straight from the intake schema, so they can
 * never drift from what the parser reads. The worked example is SYNTHETIC and
 * illustrative (modeled on a July 9 Makati page) — no real patient data — so it
 * is safe to commit.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toCsv } from "@/services/intake/csv";
import {
  TRANSACTION_HEADERS,
  SUMMARY_HEADERS,
} from "@/services/intake/logbook-intake-schema";

const OUT_DIR = "templates/logbook-intake";

type Tx = Partial<Record<(typeof TRANSACTION_HEADERS)[number], string>>;

function txGrid(rows: Tx[]): string[][] {
  return [[...TRANSACTION_HEADERS], ...rows.map((row) => TRANSACTION_HEADERS.map((k) => row[k] ?? ""))];
}

function summaryGrid(values: Partial<Record<(typeof SUMMARY_HEADERS)[number], string>>): string[][] {
  return [["field", "value"], ...SUMMARY_HEADERS.map((k) => [k, values[k] ?? ""])];
}

// --- Worked example: synthetic July 9 Makati page (illustrative only) ---------
const EXAMPLE_TX: Tx[] = [
  { date: "2026-07-09", branch: "Makati", lineNumber: "1", clientName: "Espina, Anne", timeIn: "11:10", timeOut: "12:30", sessionNo: "5/11", service: "Diode UB Hair Removal + Whitening", serviceAmount: "700", cash: "700", staff: "Ugis", bp: "154", np: "154" },
  { date: "2026-07-09", branch: "Makati", lineNumber: "2", clientName: "Rosendo, Winnie", timeIn: "9:14", sessionNo: "SS", service: "Facial Promo", serviceAmount: "400", cash: "1249", med: "Stayneez x2", medAmount: "100", staff: "Ugis", bp: "400", op: "400" },
  { lineNumber: "2", branch: "Makati", date: "2026-07-09", service: "Flotwaren F/N", serviceAmount: "599", med: "Clinda Cream x1", medAmount: "100" },
  { lineNumber: "2", branch: "Makati", date: "2026-07-09", service: "Skin Tag x1 small", serviceAmount: "250", med: "Hydrocort x1", medAmount: "100" },
  { date: "2026-07-09", branch: "Makati", lineNumber: "3", clientName: "Eusebio, Grace", timeIn: "6:15", service: "RF Face", serviceAmount: "800", cash: "800", staff: "Ugis", bp: "250", op: "250" },
];

const EXAMPLE_SUMMARY = {
  date: "2026-07-09",
  branch: "Makati",
  censusOld: "5",
  censusNew: "1",
  salesPS: "1249",
  salesMC: "300",
  salesTS: "1549",
  onlinePayment: "1549",
  onlinePaymentMode: "GCash",
  commOvernight: "115",
  otherExpenses: "139",
  otherExpensesDetail: "printing 20; distilled water 119",
  totalExpenses: "1803",
  totalCashClinic: "-254",
  pettyCash: "2000",
  medsSoaps: "300",
  thermotipsEye: "1207",
  thermotipsFace: "1418",
  thermotipsBody: "1494",
  pointsBP: "2203",
  pointsOP: "650",
  pointsNP: "1553",
  keyHolder: "Ugis / Mine",
  remarks: "No savings today",
  ledgerCheckedBy: "(signature)",
} satisfies Partial<Record<(typeof SUMMARY_HEADERS)[number], string>>;

const INSTRUCTIONS = `# How to fill the daily logbook spreadsheet

Two files per day, per branch:

- **transactions.csv** — one row per client SERVICE line.
- **daily-summary.csv** — the end-of-day totals (the logbook's second page).

## transactions.csv

Columns: ${TRANSACTION_HEADERS.join(", ")}

Rules:

1. **One row per service.** If a client had 3 services, use 3 rows and put the
   SAME \`lineNumber\` on all 3. Fill the client details (name, time, cash, staff,
   points) only on that client's FIRST row; leave them blank on the extra rows.
2. **lineNumber** is the client's number on the page (1, 2, 3, …). It groups the
   client's rows together — do not reuse a number for two different clients.
3. **Amounts:** just the number, no "₱" and no thousands comma. Write \`1549\`,
   not \`₱1,549\`. (The system ignores ₱ and commas anyway.)
4. **Blank = leave empty.** An empty cell means "nothing there", not zero.
5. **date** as \`YYYY-MM-DD\` (e.g. \`2026-07-09\`). **branch** is the branch name.

## daily-summary.csv

A two-column \`field,value\` list. Fill the \`value\` next to each field. Leave a
value blank if it does not apply that day. Fields: ${SUMMARY_HEADERS.join(", ")}.

See \`transactions.example.csv\` and \`daily-summary.example.csv\` for a filled sample.
`;

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });

  const files: [string, string][] = [
    ["transactions.template.csv", toCsv([[...TRANSACTION_HEADERS]])],
    ["daily-summary.template.csv", toCsv(summaryGrid({}))],
    ["transactions.example.csv", toCsv(txGrid(EXAMPLE_TX))],
    ["daily-summary.example.csv", toCsv(summaryGrid(EXAMPLE_SUMMARY))],
    ["INSTRUCTIONS.md", INSTRUCTIONS],
  ];

  for (const [name, content] of files) {
    const dest = path.join(OUT_DIR, name);
    writeFileSync(dest, content, "utf8");
    console.log(`wrote ${dest}`);
  }
  console.log(`\nDone. Templates in ${OUT_DIR}/ — hand transactions/daily-summary CSVs to branches.`);
}

main();
