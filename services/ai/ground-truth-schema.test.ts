// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateGroundTruth, type GroundTruthPage } from "./ground-truth-schema";

function validPage(): GroundTruthPage {
  return {
    pageType: "transaction",
    branch: "Fermosa - Imus",
    date: "2026-07-13",
    entries: [
      {
        lineNumber: 1,
        patientName: "Mojica, Haelhen",
        staff: "Mhalet",
        timeIn: "1:15 PM",
        timeOut: null,
        sessionNo: "1st",
        services: [
          { name: "Carbon Face", amount: "1500" },
          { name: "Acne Facial", amount: "500" },
        ],
        meds: [{ name: "Acne Soap", amount: "133" }],
        cash: "2999",
        bank: null,
        points: { bp: "714", op: null, np: "714" },
      },
    ],
  };
}

describe("validateGroundTruth", () => {
  it("accepts a bare-value per-patient-full transcription", () => {
    const result = validateGroundTruth(JSON.stringify(validPage()));
    expect(result.valid).toBe(true);
    expect(result.page?.entries[0]?.services).toHaveLength(2);
    expect(result.issues).toEqual([]);
  });

  it("accepts a summary page with no entries", () => {
    const result = validateGroundTruth(
      JSON.stringify({ pageType: "summary", entries: [] })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects confidence-wrapped values (that is OCR output, not ground truth)", () => {
    const wrapped = validPage() as unknown as Record<string, unknown>;
    (wrapped.entries as Array<Record<string, unknown>>)[0]!.patientName = {
      value: "Mojica, Haelhen",
      confidence: 0.9,
      unreadable: false,
    };
    const result = validateGroundTruth(JSON.stringify(wrapped));
    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/patientName/);
  });

  it("reports the path of a bad field", () => {
    const bad = validPage() as unknown as Record<string, unknown>;
    delete bad["pageType"];
    const result = validateGroundTruth(JSON.stringify(bad));
    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toMatch(/pageType/);
  });
});
