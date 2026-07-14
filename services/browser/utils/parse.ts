import type { TableCell } from "@/services/browser/driver/browser-driver";
import { LayoutChangedError } from "@/services/browser/types";

/**
 * Text/number/date parsing for scraped CRM content. Pure functions, no
 * browser access. CRM-domain mapping (status literals, role inference)
 * belongs to the connector's normalizer, not here.
 */

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Empty-state detection for the CRM's result tables. DataTables and the
 * CRM's server-rendered lists both render "no results" as a single
 * full-width cell whose text varies by page — "No data available in table",
 * "No matching records found", and (observed live, M0049) "No clients
 * available". A single-cell row starting with the word "No" in a
 * multi-column table can never be a data row, so that shape IS the signal;
 * the exact phrasing is not load-bearing.
 */
export function isEmptyTableResult(rows: TableCell[][]): boolean {
  if (rows.length === 0) return true;
  const first = rows[0];
  return (
    rows.length === 1 &&
    first !== undefined &&
    first.length === 1 &&
    /^no\b/i.test(normalizeText(first[0]?.text ?? ""))
  );
}

/** "₱15,999.00" | "15,999.00" | "1500" → "15999.00" (money as decimal string). */
export function parseMoney(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = normalizeText(value).replace(/[^\d.-]/g, "");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number.parseFloat(cleaned).toFixed(2);
}

/**
 * Best-effort ISO date (yyyy-mm-dd). Handles the CRM's observed shapes:
 * "2026-05-13", "1970-10-11 00:00:00" (raw value attributes), and
 * "JUL 13, 2026 07:54 PM". Relative dates ("1 year ago") are unrecoverable
 * and return null — absence must be representable, never guessed.
 */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = normalizeText(value);
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1] ?? null;
  if (/\bago\b/i.test(text)) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Full timestamp variant — "2026-07-13 18:32:52" → ISO 8601. */
export function toIsoDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = normalizeText(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)$/);
  if (match) return `${match[1]}T${match[2] ?? ""}${match[2]?.length === 5 ? ":00" : ""}`;
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}T00:00:00`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export interface PackageTitle {
  packageName: string;
  sessionsDone: number | null;
  sessionsTotal: number | null;
}

/** "CARBON LASER 5+1 (7/10) completed" → name + progress counters. */
export function parsePackageTitle(title: string): PackageTitle {
  const text = normalizeText(title);
  const match = text.match(/^(.*?)\s*\((\d+)\s*\/\s*(\d+)\)\s*completed$/i);
  if (!match) return { packageName: text, sessionsDone: null, sessionsTotal: null };
  return {
    packageName: normalizeText(match[1] ?? ""),
    sessionsDone: Number.parseInt(match[2] ?? "", 10),
    sessionsTotal: Number.parseInt(match[3] ?? "", 10),
  };
}

/**
 * Resolve required column headers to indices — the structural fingerprint
 * for tables (CRM_DISCOVERY §5: a header mismatch is layout drift, detected
 * loudly before a single row is parsed). Matching is case-insensitive on
 * normalized text.
 */
export function headerIndexMap<K extends string>(
  headers: readonly string[],
  required: readonly K[],
  context: string
): Record<K, number> {
  const normalized = headers.map((header) => normalizeText(header).toUpperCase());
  const result = {} as Record<K, number>;
  const missing: string[] = [];
  for (const name of required) {
    const index = normalized.indexOf(name.toUpperCase());
    if (index === -1) {
      missing.push(name);
    } else {
      result[name] = index;
    }
  }
  if (missing.length > 0) {
    throw new LayoutChangedError(
      `${context}: expected column header(s) ${missing.map((m) => `"${m}"`).join(", ")} not found ` +
        `in [${headers.join(" | ")}]. The selector map likely needs a new version.`
    );
  }
  return result;
}
