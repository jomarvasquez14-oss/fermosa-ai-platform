import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { writeIntakeWorkbook, readIntakeWorkbook } from "./workbook";
import { parseTransactionsGrid, parseSummaryGrid } from "./logbook-intake";
import { TRANSACTION_HEADERS } from "./logbook-intake-schema";

function tempFile(): { dir: string; file: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "intake-"));
  return { dir, file: path.join(dir, "logbook.xlsx") };
}

describe("intake workbook", () => {
  it("writes two tabs and reads them back into parseable grids", async () => {
    const { dir, file } = tempFile();
    try {
      const transactions = [
        [...TRANSACTION_HEADERS],
        ["2026-07-09", "Makati", "2", "Rosendo, Winnie", "9:14", "", "SS", "Facial Promo", "400", "1249", "", "Stayneez x2", "100", "Ugis", "400", "400", ""],
        ["2026-07-09", "Makati", "2", "", "", "", "", "Flotwaren F/N", "599", "", "", "", "", "", "", "", ""],
      ];
      const summary = [
        ["field", "value"],
        ["date", "2026-07-09"],
        ["branch", "Makati"],
        ["salesTS", "1549"],
      ];
      await writeIntakeWorkbook(file, { transactions, summary });

      const wb = await readIntakeWorkbook(file);
      expect(wb.issues).toEqual([]);

      const tx = parseTransactionsGrid(wb.transactions);
      expect(tx.issues).toEqual([]);
      expect(tx.entries).toHaveLength(1);
      expect(tx.entries[0]).toMatchObject({
        lineNumber: 2,
        patientName: "Rosendo, Winnie",
        treatment: "Facial Promo",
        therapist: "Ugis",
        time: "9:14",
      });
      // Amount written as a numeric cell round-trips back to its text value.
      expect(tx.rows[0]!.services).toHaveLength(2);
      expect(tx.rows[0]!.services[0]!.amount).toBe("400");

      const sum = parseSummaryGrid(wb.summary);
      expect(sum.summary?.salesTS).toBe("1549");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a workbook that is missing the Transactions sheet", async () => {
    const { dir, file } = tempFile();
    try {
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet("Daily Summary").addRow(["field", "value"]);
      await wb.xlsx.writeFile(file);

      const result = await readIntakeWorkbook(file);
      expect(result.issues.join(" ")).toContain("Transactions");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
