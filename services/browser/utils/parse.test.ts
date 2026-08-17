// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TableCell } from "@/services/browser/driver/browser-driver";
import {
  headerIndexMap,
  isEmptyTableResult,
  normalizeText,
  parseMoney,
  parsePackageTitle,
  toIsoDate,
  toIsoDateTime,
} from "./parse";

describe("parseMoney", () => {
  it("normalizes CRM money formats to decimal strings", () => {
    expect(parseMoney("15,999.00")).toBe("15999.00");
    expect(parseMoney("₱2,500.00")).toBe("2500.00");
    expect(parseMoney("1500")).toBe("1500.00");
    expect(parseMoney("0.00")).toBe("0.00");
  });

  it("returns null for unparseable input — never a guessed number", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("N/A")).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });
});

describe("toIsoDate / toIsoDateTime", () => {
  it("handles the CRM's observed date shapes", () => {
    expect(toIsoDate("2026-05-13")).toBe("2026-05-13");
    expect(toIsoDate("1970-10-11 00:00:00")).toBe("1970-10-11");
    expect(toIsoDate("JUL 13, 2026 07:54 PM")).toBe("2026-07-13");
  });

  it("refuses relative dates — absence beats guesses", () => {
    expect(toIsoDate("1 year ago")).toBeNull();
    expect(toIsoDate("")).toBeNull();
  });

  it("emits full timestamps for activity dates", () => {
    expect(toIsoDateTime("2026-07-13 18:32:52")).toBe("2026-07-13T18:32:52");
    expect(toIsoDateTime("2026-07-13")).toBe("2026-07-13T00:00:00");
  });
});

describe("parsePackageTitle", () => {
  it("extracts package name and progress", () => {
    expect(parsePackageTitle("CARBON LASER 5+1 (7/10) completed")).toEqual({
      packageName: "CARBON LASER 5+1",
      sessionsDone: 7,
      sessionsTotal: 10,
    });
  });

  it("passes through titles without a progress suffix", () => {
    expect(parsePackageTitle("  DIAMOND   PEEL ")).toEqual({
      packageName: "DIAMOND PEEL",
      sessionsDone: null,
      sessionsTotal: null,
    });
  });
});

describe("headerIndexMap", () => {
  it("maps required headers case-insensitively", () => {
    const map = headerIndexMap(["", "Ref No", "STATUS"], ["REF NO", "STATUS"], "test");
    expect(map["REF NO"]).toBe(1);
    expect(map.STATUS).toBe(2);
  });

  it("missing headers are CRM_LAYOUT naming every absent column", () => {
    expect(() => headerIndexMap(["A", "B"], ["A", "MISSING"], "Invoice list")).toThrow(
      /Invoice list: expected column header\(s\) "MISSING"/
    );
  });
});

describe("normalizeText", () => {
  it("collapses whitespace", () => {
    expect(normalizeText("  a \n  b\tc ")).toBe("a b c");
  });
});

describe("isEmptyTableResult", () => {
  const cell = (text: string): TableCell => ({
    text,
    value: null,
    selectedLabel: null,
    links: [],
  });

  it("recognizes every observed empty-state phrasing", () => {
    expect(isEmptyTableResult([])).toBe(true);
    expect(isEmptyTableResult([[cell("No data available in table")]])).toBe(true);
    expect(isEmptyTableResult([[cell("No matching records found")]])).toBe(true);
    // Observed live (M0049): the server-rendered patients list.
    expect(isEmptyTableResult([[cell("No clients available")]])).toBe(true);
  });

  it("never mistakes data rows for the empty state", () => {
    expect(isEmptyTableResult([[cell("Santos, Maria"), cell("MEMBER")]])).toBe(false);
    // Single cell but not the word "No" — e.g. a name starting with those letters.
    expect(isEmptyTableResult([[cell("Norberto")]])).toBe(false);
    // Two single-cell rows are data, not an empty marker.
    expect(isEmptyTableResult([[cell("No")], [cell("No")]])).toBe(false);
  });
});
