import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OcrPageExtraction } from "@/services/ai/ocr-schema";
import { buildReviewPages, useOcrReview } from "./use-ocr-review";

function field(value: string | null, confidence: number, unreadable = false) {
  return { value, confidence, unreadable };
}

function extraction(): OcrPageExtraction {
  return {
    schemaVersion: 1,
    pageNumber: 1,
    entries: [
      {
        lineNumber: 1,
        patientName: field("Maria Santos", 0.97), // auto-accepted
        treatment: field("Gluta Drip", 0.9), // review band → pending
        therapist: field(null, 0, true), // model-unreadable → pending
        time: field("2:30 PM", 0.7), // manual band → pending
        boundingBox: null,
        entryConfidence: 0.7,
      },
    ],
    unreadableRegions: [{ lineNumber: 1, reason: "smudge" }],
    pageConfidence: 0.7,
    notes: null,
  };
}

function setup() {
  const pages = buildReviewPages([
    { imageId: "img-1", fileName: "p1.png", extraction: extraction() },
  ]);
  return renderHook(() => useOcrReview(pages));
}

describe("buildReviewPages", () => {
  it("pre-accepts only high-confidence readable fields (§5)", () => {
    const [page] = buildReviewPages([
      { imageId: "img-1", fileName: "p1.png", extraction: extraction() },
    ]);
    const fields = page!.entries[0]!.fields;
    expect(fields.patientName.status).toBe("accepted");
    expect(fields.treatment.status).toBe("pending");
    expect(fields.therapist.status).toBe("pending"); // human must confirm illegibility
    expect(fields.time.status).toBe("pending");
  });
});

describe("useOcrReview", () => {
  it("accept / edit / markUnreadable resolve fields and feed progress", () => {
    const { result } = setup();
    act(() => result.current.accept("img-1", 1, "treatment"));
    act(() => result.current.edit("img-1", 1, "time", "3:30 PM"));
    act(() => result.current.markUnreadable("img-1", 1, "therapist"));

    const fields = result.current.pages[0]!.entries[0]!.fields;
    expect(fields.treatment.status).toBe("accepted");
    expect(fields.time).toMatchObject({ status: "edited", value: "3:30 PM" });
    expect(fields.time.originalValue).toBe("2:30 PM"); // OCR value never lost
    expect(fields.therapist.status).toBe("unreadable");

    expect(result.current.progress).toMatchObject({
      fieldsTotal: 4,
      fieldsResolved: 4,
      pending: 0,
      autoAccepted: 1,
      accepted: 1,
      edited: 1,
      unreadable: 1,
    });
  });

  it("reset returns a field to pending with the original OCR value", () => {
    const { result } = setup();
    act(() => result.current.edit("img-1", 1, "time", "9:99"));
    act(() => result.current.reset("img-1", 1, "time"));
    const time = result.current.pages[0]!.entries[0]!.fields.time;
    expect(time).toMatchObject({ status: "pending", value: "2:30 PM" });
  });

  it("blocks page confirmation until every field is resolved", () => {
    const { result } = setup();
    let confirmed = false;
    act(() => {
      confirmed = result.current.confirmPage("img-1");
    });
    expect(confirmed).toBe(false);
    expect(result.current.pages[0]!.confirmed).toBe(false);

    act(() => result.current.accept("img-1", 1, "treatment"));
    act(() => result.current.markUnreadable("img-1", 1, "therapist"));
    act(() => result.current.edit("img-1", 1, "time", "3:00 PM"));
    act(() => {
      confirmed = result.current.confirmPage("img-1");
    });
    expect(confirmed).toBe(true);
    expect(result.current.pages[0]!.confirmed).toBe(true);
    expect(result.current.progress.pagesConfirmed).toBe(1);
  });

  it("confirmed pages are frozen against further field changes", () => {
    const { result } = setup();
    act(() => {
      result.current.accept("img-1", 1, "treatment");
      result.current.markUnreadable("img-1", 1, "therapist");
      result.current.edit("img-1", 1, "time", "3:00 PM");
    });
    act(() => void result.current.confirmPage("img-1"));
    act(() => result.current.edit("img-1", 1, "treatment", "tampered"));
    expect(result.current.pages[0]!.entries[0]!.fields.treatment.value).toBe("Gluta Drip");
  });
});
