import ExcelJS from "exceljs";

/**
 * Excel workbook read/write for logbook intake (M0062). A single `.xlsx` file
 * carries the two sheets branches fill — "Transactions" and "Daily Summary" —
 * as separate tabs, which CSV cannot do. This module is the ONLY place that
 * touches the `exceljs` dependency; the parser core stays pure and grid-based,
 * so a workbook sheet and a CSV go through the exact same logic.
 */

export const TRANSACTIONS_SHEET = "Transactions";
export const SUMMARY_SHEET = "Daily Summary";
export const INSTRUCTIONS_SHEET = "Instructions";

/** A cell value as text: numbers/dates → string, blank → "", rich text flattened. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(v.richText)) return v.richText.map((part) => part.text).join("");
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return "";
  }
  return String(value);
}

/** Pure numbers become numeric cells (no "number stored as text" warning);
 *  everything else (names, dates, times, "5/11", "SS") stays text. */
function typedCell(text: string): string | number {
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
}

function addSheet(workbook: ExcelJS.Workbook, name: string, grid: string[][]): void {
  const sheet = workbook.addWorksheet(name);
  for (const row of grid) sheet.addRow(row.map(typedCell));
  if (grid[0]) sheet.getRow(1).font = { bold: true };
}

/** Write an intake workbook with Transactions + Daily Summary (+ optional
 *  Instructions) tabs. Grids are `string[][]` (header row first). */
export async function writeIntakeWorkbook(
  filePath: string,
  sheets: { transactions: string[][]; summary: string[][]; instructions?: string[][] }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Fermosa AI Platform";
  addSheet(workbook, TRANSACTIONS_SHEET, sheets.transactions);
  addSheet(workbook, SUMMARY_SHEET, sheets.summary);
  if (sheets.instructions) addSheet(workbook, INSTRUCTIONS_SHEET, sheets.instructions);
  await workbook.xlsx.writeFile(filePath);
}

function sheetToGrid(sheet: ExcelJS.Worksheet | undefined): string[][] {
  if (!sheet) return [];
  const columnCount = sheet.columnCount;
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let col = 1; col <= columnCount; col++) cells.push(cellText(row.getCell(col).value));
    grid.push(cells);
  });
  return grid;
}

function findSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  const lower = name.toLowerCase();
  return workbook.worksheets.find((sheet) => sheet.name.trim().toLowerCase() === lower);
}

export interface ReadWorkbookResult {
  transactions: string[][];
  summary: string[][];
  issues: string[];
}

/** Read a filled intake workbook into the two sheet grids. Missing sheets are
 *  reported as issues (not thrown), matching the parser's error style. */
export async function readIntakeWorkbook(filePath: string): Promise<ReadWorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const issues: string[] = [];

  const txSheet = findSheet(workbook, TRANSACTIONS_SHEET);
  if (!txSheet) issues.push(`Workbook has no "${TRANSACTIONS_SHEET}" sheet.`);
  const summarySheet = findSheet(workbook, SUMMARY_SHEET);

  return {
    transactions: sheetToGrid(txSheet),
    summary: sheetToGrid(summarySheet),
    issues,
  };
}
