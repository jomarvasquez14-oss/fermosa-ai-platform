/**
 * Minimal CSV reader/writer (M0061) — no runtime dependency. Excel reads and
 * writes exactly this format, so it is the interchange for the typed-logbook
 * intake path.
 *
 * RFC-4180-ish: fields may be wrapped in double quotes to carry commas,
 * newlines, or quotes; a literal quote inside a quoted field is doubled ("").
 * CRLF and LF line endings are both accepted.
 */

/** Parse CSV text into a grid of raw string cells (no trimming, no typing). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Flush the final field/row when the text does not end with a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** True when every cell in the row is empty/whitespace — a blank spreadsheet line. */
export function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

function encodeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize a grid to CSV text (CRLF line endings, trailing newline). */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(encodeCell).join(",")).join("\r\n") + "\r\n";
}
