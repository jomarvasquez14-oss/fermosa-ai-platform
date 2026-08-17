// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateOcrExtraction, type ExtractedField, type OcrPageExtraction } from "./ocr-schema";

function field(value: string | null, confidence = 0.9, unreadable = false): ExtractedField {
  return { value, confidence, unreadable };
}

function validSample(): OcrPageExtraction {
  return {
    schemaVersion: 2,
    pageNumber: 1,
    pageType: "transaction",
    entries: [
      {
        lineNumber: 1,
        patientName: field("Mojica, Haelhen", 0.93),
        staff: field(null, 0, true),
        timeIn: field("1:15 PM", 0.9),
        timeOut: field(null),
        sessionNo: field("1st", 0.8),
        services: [
          { name: field("Carbon Face", 0.95), amount: field("1500", 0.9) },
          { name: field("Acne Facial", 0.9), amount: field("500", 0.88) },
        ],
        meds: [{ name: field("Acne Soap", 0.9), amount: field("133", 0.85) }],
        cash: field("2999", 0.9),
        bank: field(null),
        points: { bp: field("714", 0.8), op: field(null), np: field("714", 0.8) },
        boundingBox: null,
        entryConfidence: 0,
      },
    ],
    unreadableRegions: [{ lineNumber: 1, reason: "smudged staff initials" }],
    pageConfidence: 0,
    notes: null,
  };
}

describe("validateOcrExtraction (schema v2)", () => {
  it("accepts a schema-conforming per-patient-full response", () => {
    const result = validateOcrExtraction(JSON.stringify(validSample()));
    expect(result.valid).toBe(true);
    expect(result.extraction?.entries).toHaveLength(1);
    expect(result.extraction?.entries[0]?.services).toHaveLength(2);
    expect(result.issues).toEqual([]);
  });

  it("accepts a summary page with zero entries", () => {
    const summary = { ...validSample(), pageType: "summary" as const, entries: [] };
    const result = validateOcrExtraction(JSON.stringify(summary));
    expect(result.valid).toBe(true);
    expect(result.extraction?.entries).toEqual([]);
  });

  it("rejects a v1-shaped payload (schemaVersion + missing per-patient-full fields)", () => {
    const v1 = {
      schemaVersion: 1,
      pageNumber: 1,
      entries: [
        {
          lineNumber: 1,
          patientName: field("Maria Santos"),
          treatment: field("Diamond Peel"),
          therapist: field("J. Cruz"),
          time: field("2:30 PM"),
          boundingBox: null,
          entryConfidence: 0.88,
        },
      ],
      unreadableRegions: [],
      pageConfidence: 0.88,
      notes: null,
    };
    const result = validateOcrExtraction(JSON.stringify(v1));
    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/schemaVersion|pageType|staff|services/);
  });

  it("rejects non-JSON with a parse issue", () => {
    const result = validateOcrExtraction("not json {");
    expect(result.valid).toBe(false);
    expect(result.extraction).toBeNull();
    expect(result.issues[0]).toMatch(/not valid JSON/);
  });

  it("reports schema violations with field paths", () => {
    const bad = validSample() as unknown as Record<string, unknown>;
    bad["pageNumber"] = "one";
    delete bad["unreadableRegions"];
    const result = validateOcrExtraction(JSON.stringify(bad));
    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/pageNumber/);
    expect(result.issues.join("\n")).toMatch(/unreadableRegions/);
  });

  it("rejects out-of-range confidence", () => {
    const bad = validSample();
    bad.entries[0]!.patientName.confidence = 1.7;
    const result = validateOcrExtraction(JSON.stringify(bad));
    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/patientName\.confidence/);
  });
});
