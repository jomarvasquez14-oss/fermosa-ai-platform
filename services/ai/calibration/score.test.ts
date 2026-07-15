// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ExtractedField, OcrPageExtraction } from "@/services/ai/ocr-schema";
import type { GroundTruthPage } from "@/services/ai/ground-truth-schema";
import { aggregate, normalizeValue, scorePage, SCALAR_KEYS } from "./score";

const f = (value: string | null, confidence = 0.9): ExtractedField => ({
  value,
  confidence,
  unreadable: value === null,
});

function extraction(over: { staffConf?: number; staffValue?: string | null } = {}): OcrPageExtraction {
  return {
    schemaVersion: 2,
    pageNumber: 1,
    pageType: "transaction",
    entries: [
      {
        lineNumber: 1,
        patientName: f("Mojica, Haelhen", 0.97),
        staff: f(over.staffValue ?? "Mhalet", over.staffConf ?? 0.9),
        timeIn: f("1:15 PM", 0.85),
        timeOut: f(null),
        sessionNo: f("1st", 0.8),
        cash: f("2,000", 0.96), // comma — normalization must match "2000"
        bank: f(null),
        services: [{ name: f("Carbon Face"), amount: f("1500") }],
        meds: [],
        points: { bp: f(null), op: f(null), np: f(null) },
        boundingBox: null,
        entryConfidence: 0.8,
      },
    ],
    unreadableRegions: [],
    pageConfidence: 0.8,
    notes: null,
  };
}

function truth(): GroundTruthPage {
  return {
    pageType: "transaction",
    entries: [
      {
        lineNumber: 1,
        patientName: "Mojica, Haelhen",
        staff: "Mhalet",
        timeIn: "1:15 PM",
        timeOut: null,
        sessionNo: "1st",
        cash: "2000",
        bank: null,
        services: [{ name: "Carbon Face", amount: "1500" }],
        meds: [],
        points: { bp: null, op: null, np: null },
      },
    ],
  };
}

describe("normalizeValue", () => {
  it("collapses blanks/nulls, lowercases, and normalizes numbers", () => {
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue("  ")).toBeNull();
    expect(normalizeValue("  Carbon   Face ")).toBe("carbon face");
    expect(normalizeValue("2,000")).toBe("2000");
    expect(normalizeValue("₱1500")).toBe("1500");
  });
});

describe("scorePage", () => {
  it("scores a perfect transcription as fully correct (incl. numeric normalization)", () => {
    const score = scorePage(extraction(), truth());
    expect(score.entriesMatched).toBe(1);
    for (const key of SCALAR_KEYS) {
      expect(score.scalar[key]).toEqual({ total: 1, correct: 1 });
    }
    expect(score.services).toEqual({ matched: 1, expected: 1, extracted: 1 });
  });

  it("counts a wrong field as incorrect and buckets it by confidence", () => {
    const score = scorePage(extraction({ staffValue: "Wrong Name", staffConf: 0.6 }), truth());
    expect(score.scalar.staff).toEqual({ total: 1, correct: 0 });
    const manual = score.buckets.find((b) => b.band === "manual (<0.80)")!;
    expect(manual.n).toBe(1); // the staff field
    expect(manual.correct).toBe(0);
    const auto = score.buckets.find((b) => b.band === "auto (≥0.95)")!;
    expect(auto.correct).toBe(auto.n); // patientName + cash both matched
  });

  it("ignores extracted entries with no matching ground-truth line", () => {
    const extra = extraction();
    extra.entries.push({ ...extra.entries[0]!, lineNumber: 2 });
    const score = scorePage(extra, truth());
    expect(score.entriesExtracted).toBe(2);
    expect(score.entriesMatched).toBe(1);
  });
});

describe("aggregate", () => {
  it("sums page scores", () => {
    const total = aggregate([scorePage(extraction(), truth()), scorePage(extraction(), truth())]);
    expect(total.entriesMatched).toBe(2);
    expect(total.scalar.patientName).toEqual({ total: 2, correct: 2 });
    expect(total.services).toEqual({ matched: 2, expected: 2, extracted: 2 });
  });
});
