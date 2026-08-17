/**
 * intake:template (M0061 · workbook M0062) — write the intake templates branches
 * fill to templates/logbook-intake/.
 *
 * Primary deliverable is a single Excel workbook with the two sheets on separate
 * TABS ("Transactions" + "Daily Summary", plus an "Instructions" tab), because
 * CSV cannot hold multiple tabs. A blank template workbook and a filled worked
 * example are written, plus a standalone INSTRUCTIONS.md. The example is
 * SYNTHETIC (July 9 Makati shape) — no real patient data — so it is safe to commit.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  TRANSACTION_HEADERS,
  SUMMARY_HEADERS,
} from "@/services/intake/logbook-intake-schema";
import { writeIntakeWorkbook } from "@/services/intake/workbook";

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

const INSTRUCTIONS = `# How to fill the daily logbook workbook

One Excel file per day, per branch: **logbook-intake.xlsx**. It has tabs at the
bottom:

- **Transactions** — one row per client SERVICE line.
- **Daily Summary** — the end-of-day totals (the logbook's second page).
- **Instructions** — these rules, repeated inside the file.

## Transactions tab

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

## Daily Summary tab

A two-column \`field\` / \`value\` list. Type the value next to each field; leave it
blank if it does not apply that day. Fields: ${SUMMARY_HEADERS.join(", ")}.

## Saving

Keep the file as an **Excel Workbook (.xlsx)** — do not split the tabs into
separate files. Send the whole \`logbook-intake.xlsx\`.

See \`logbook-intake.example.xlsx\` for a filled sample.
`;

const instructionsGrid: string[][] = INSTRUCTIONS.split("\n").map((line) => [line]);

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const templatePath = path.join(OUT_DIR, "logbook-intake.template.xlsx");
  const examplePath = path.join(OUT_DIR, "logbook-intake.example.xlsx");
  const instructionsPath = path.join(OUT_DIR, "INSTRUCTIONS.md");

  await writeIntakeWorkbook(templatePath, {
    transactions: [[...TRANSACTION_HEADERS]],
    summary: summaryGrid({}),
    instructions: instructionsGrid,
  });
  await writeIntakeWorkbook(examplePath, {
    transactions: txGrid(EXAMPLE_TX),
    summary: summaryGrid(EXAMPLE_SUMMARY),
    instructions: instructionsGrid,
  });
  writeFileSync(instructionsPath, INSTRUCTIONS, "utf8");

  for (const dest of [templatePath, examplePath, instructionsPath]) console.log(`wrote ${dest}`);
  console.log(
    `\nDone. Hand branches ${path.join(OUT_DIR, "logbook-intake.template.xlsx")} (two tabs). ` +
      `Check a filled one with: pnpm intake:check <file.xlsx>`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
