import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";
import { parseTransactions, parseSummary } from "./logbook-intake";
import { TRANSACTION_HEADERS, SUMMARY_HEADERS } from "./logbook-intake-schema";

const HEADER = [...TRANSACTION_HEADERS];

/** Build a Transactions CSV from partial rows keyed by column name. */
function txCsv(rows: Array<Partial<Record<(typeof TRANSACTION_HEADERS)[number], string>>>): string {
  const grid = [HEADER, ...rows.map((row) => HEADER.map((key) => row[key] ?? ""))];
  return toCsv(grid);
}

describe("parseTransactions", () => {
  it("groups multiple service lines for one client into a single ConfirmedEntry", () => {
    const csv = txCsv([
      { date: "2026-07-09", branch: "Makati", lineNumber: "2", clientName: "Rosendo, Winnie", timeIn: "9:14", service: "Facial Promo", serviceAmount: "400", cash: "1249", staff: "Ugis" },
      { lineNumber: "2", branch: "Makati", date: "2026-07-09", service: "Flotwaren F/N", serviceAmount: "599" },
      { lineNumber: "2", branch: "Makati", date: "2026-07-09", service: "Skin Tag x1 small", serviceAmount: "250" },
    ]);

    const { entries, rows, issues } = parseTransactions(csv);

    expect(issues).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      lineNumber: 2,
      patientName: "Rosendo, Winnie",
      treatment: "Facial Promo", // primary service → treatment
      therapist: "Ugis", // staff → therapist
      time: "9:14", // timeIn → time
    });
    expect(rows[0]!.services).toHaveLength(3);
    expect(rows[0]!.services.map((s) => s.name)).toEqual([
      "Facial Promo",
      "Flotwaren F/N",
      "Skin Tag x1 small",
    ]);
  });

  it("maps blank cells to null (absent value)", () => {
    const csv = txCsv([
      { date: "2026-07-09", branch: "Makati", lineNumber: "1", clientName: "Espina, Anne", service: "Whitening", staff: "Ugis" },
    ]);
    const { entries, rows } = parseTransactions(csv);
    expect(entries[0]!.time).toBeNull();
    expect(rows[0]!.timeOut).toBeNull();
    expect(rows[0]!.bank).toBeNull();
  });

  it("strips peso signs and thousands separators from amounts", () => {
    const csv = txCsv([
      { date: "2026-07-09", branch: "Makati", lineNumber: "3", clientName: "Eusebio, Grace", service: "RF Face", serviceAmount: "₱800", cash: "1,549" },
    ]);
    const { rows } = parseTransactions(csv);
    expect(rows[0]!.services[0]!.amount).toBe("800");
    expect(rows[0]!.cash).toBe("1549");
  });

  it("reports a non-numeric lineNumber as an issue and skips the client", () => {
    const csv = txCsv([
      { date: "2026-07-09", branch: "Makati", lineNumber: "one", clientName: "Bad Row", service: "X" },
    ]);
    const { entries, issues } = parseTransactions(csv);
    expect(entries).toHaveLength(0);
    expect(issues.join(" ")).toContain("lineNumber");
  });

  it("reports a missing required column", () => {
    const csv = toCsv([
      ["date", "branch", "clientName"],
      ["2026-07-09", "Makati", "Someone"],
    ]);
    const { issues } = parseTransactions(csv);
    expect(issues.join(" ")).toContain("lineNumber");
  });

  it("flags a continuation row whose clientName disagrees with the group", () => {
    const csv = txCsv([
      { date: "2026-07-09", branch: "Makati", lineNumber: "1", clientName: "Espina, Anne", service: "A" },
      { date: "2026-07-09", branch: "Makati", lineNumber: "1", clientName: "Different Name", service: "B" },
    ]);
    const { issues } = parseTransactions(csv);
    expect(issues.join(" ")).toContain("differs from");
  });
});

describe("parseSummary", () => {
  it("parses field/value rows into a typed summary", () => {
    const grid = [
      ["field", "value"],
      ["date", "2026-07-09"],
      ["branch", "Makati"],
      ["salesTS", "1549"],
      ["remarks", "No savings today"],
    ];
    const { summary, issues } = parseSummary(toCsv(grid));
    expect(issues).toEqual([]);
    expect(summary).not.toBeNull();
    expect(summary!.branch).toBe("Makati");
    expect(summary!.salesTS).toBe("1549");
    expect(summary!.pettyCash).toBeNull(); // absent field defaults to null
  });

  it("reports unknown summary fields", () => {
    const grid = [
      ["field", "value"],
      ["date", "2026-07-09"],
      ["mysteryField", "42"],
    ];
    const { issues } = parseSummary(toCsv(grid));
    expect(issues.join(" ")).toContain("mysteryField");
  });

  it("covers every declared summary header without error", () => {
    const grid = [["field", "value"], ...SUMMARY_HEADERS.map((key) => [key, "x"])];
    const { summary, issues } = parseSummary(toCsv(grid));
    expect(issues).toEqual([]);
    expect(summary).not.toBeNull();
  });
});
