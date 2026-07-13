// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateOcrExtraction, type OcrPageExtraction } from "./ocr-schema";

function validSample(): OcrPageExtraction {
  return {
    schemaVersion: 1,
    pageNumber: 1,
    entries: [
      {
        lineNumber: 1,
        patientName: { value: "Maria Santos", confidence: 0.93, unreadable: false },
        treatment: { value: "Diamond Peel", confidence: 0.97, unreadable: false },
        therapist: { value: null, confidence: 0, unreadable: true },
        time: { value: "2:30 PM", confidence: 0.88, unreadable: false },
        boundingBox: null,
        entryConfidence: 0.88,
      },
    ],
    unreadableRegions: [{ lineNumber: 1, reason: "smudge" }],
    pageConfidence: 0.88,
    notes: null,
  };
}

describe("validateOcrExtraction", () => {
  it("accepts a schema-conforming response", () => {
    const result = validateOcrExtraction(JSON.stringify(validSample()));
    expect(result.valid).toBe(true);
    expect(result.extraction?.entries).toHaveLength(1);
    expect(result.issues).toEqual([]);
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
