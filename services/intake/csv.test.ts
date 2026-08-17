import { describe, it, expect } from "vitest";
import { parseCsv, toCsv, isBlankRow } from "./csv";

describe("parseCsv", () => {
  it("parses a simple grid", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("honors quoted fields with embedded commas", () => {
    expect(parseCsv('name,note\n"Cruz, Ana","paid, cash"\n')).toEqual([
      ["name", "note"],
      ["Cruz, Ana", "paid, cash"],
    ]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(parseCsv('a\n"she said ""hi"""\n')).toEqual([["a"], ['she said "hi"']]);
  });

  it("does not emit a trailing empty row for a trailing newline", () => {
    expect(parseCsv("a\nb\n")).toEqual([["a"], ["b"]]);
  });

  it("keeps the final row when there is no trailing newline", () => {
    expect(parseCsv("a\nb")).toEqual([["a"], ["b"]]);
  });

  it("accepts CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("isBlankRow", () => {
  it("treats all-whitespace rows as blank", () => {
    expect(isBlankRow(["", "  ", ""])).toBe(true);
    expect(isBlankRow(["", "x"])).toBe(false);
  });
});

describe("toCsv", () => {
  it("round-trips through parseCsv, quoting where needed", () => {
    const grid = [
      ["name", "note"],
      ["Cruz, Ana", 'say "hi"'],
    ];
    expect(parseCsv(toCsv(grid))).toEqual(grid);
  });
});
