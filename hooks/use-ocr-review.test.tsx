import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ExtractedField, OcrPageExtraction } from "@/services/ai/ocr-schema";
import { buildReviewPages, useOcrReview, type UseOcrReviewReturn } from "./use-ocr-review";

function field(value: string | null, confidence: number, unreadable = false): ExtractedField {
  return { value, confidence, unreadable };
}

/** One transaction row: patientName auto-accepts (≥0.95); the other 6 scalar
 *  review fields start pending (low confidence, or null/unreadable). */
function extraction(): OcrPageExtraction {
  const blank = field(null, 0.9);
  return {
    schemaVersion: 2,
    pageNumber: 1,
    pageType: "transaction",
    entries: [
      {
        lineNumber: 1,
        patientName: field("Mojica, Haelhen", 0.97), // auto-accepted
        staff: field(null, 0, true), // model-unreadable → pending
        timeIn: field("2:30 PM", 0.7), // manual band → pending
        timeOut: field(null, 0.9), // absent → pending
        sessionNo: field("1st", 0.9), // review band → pending
        cash: field("1500", 0.9), // review band → pending
        bank: field(null, 0.9), // absent → pending
        services: [{ name: field("Carbon Face", 0.9), amount: field("1500", 0.9) }],
        meds: [],
        points: { bp: blank, op: blank, np: blank },
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

/** Resolve the 6 non-auto-accepted scalar fields (accept / edit / unreadable). */
function resolvePending(result: { current: UseOcrReviewReturn }) {
  act(() => {
    result.current.accept("img-1", 1, "sessionNo");
    result.current.accept("img-1", 1, "cash");
    result.current.edit("img-1", 1, "timeIn", "3:30 PM");
    result.current.markUnreadable("img-1", 1, "staff");
    result.current.markUnreadable("img-1", 1, "timeOut");
    result.current.markUnreadable("img-1", 1, "bank");
  });
}

describe("buildReviewPages", () => {
  it("pre-accepts only high-confidence readable fields (§5)", () => {
    const [page] = buildReviewPages([
      { imageId: "img-1", fileName: "p1.png", extraction: extraction() },
    ]);
    const fields = page!.entries[0]!.fields;
    expect(fields.patientName.status).toBe("accepted");
    expect(fields.staff.status).toBe("pending"); // human must confirm illegibility
    expect(fields.timeIn.status).toBe("pending");
    expect(fields.cash.status).toBe("pending");
  });
});

describe("useOcrReview", () => {
  it("accept / edit / markUnreadable resolve fields and feed progress", () => {
    const { result } = setup();
    resolvePending(result);

    const fields = result.current.pages[0]!.entries[0]!.fields;
    expect(fields.sessionNo.status).toBe("accepted");
    expect(fields.timeIn).toMatchObject({ status: "edited", value: "3:30 PM" });
    expect(fields.timeIn.originalValue).toBe("2:30 PM"); // OCR value never lost
    expect(fields.staff.status).toBe("unreadable");

    expect(result.current.progress).toMatchObject({
      fieldsTotal: 7,
      fieldsResolved: 7,
      pending: 0,
      autoAccepted: 1, // patientName
      accepted: 2, // sessionNo, cash
      edited: 1, // timeIn
      unreadable: 3, // staff, timeOut, bank
    });
  });

  it("reset returns a field to pending with the original OCR value", () => {
    const { result } = setup();
    act(() => result.current.edit("img-1", 1, "timeIn", "9:99"));
    act(() => result.current.reset("img-1", 1, "timeIn"));
    const timeIn = result.current.pages[0]!.entries[0]!.fields.timeIn;
    expect(timeIn).toMatchObject({ status: "pending", value: "2:30 PM" });
  });

  it("blocks page confirmation until every field is resolved", () => {
    const { result } = setup();
    let confirmed = false;
    act(() => {
      confirmed = result.current.confirmPage("img-1");
    });
    expect(confirmed).toBe(false);
    expect(result.current.pages[0]!.confirmed).toBe(false);

    resolvePending(result);
    act(() => {
      confirmed = result.current.confirmPage("img-1");
    });
    expect(confirmed).toBe(true);
    expect(result.current.pages[0]!.confirmed).toBe(true);
    expect(result.current.progress.pagesConfirmed).toBe(1);
  });

  it("confirmed pages are frozen against further field changes", () => {
    const { result } = setup();
    resolvePending(result);
    act(() => void result.current.confirmPage("img-1"));
    act(() => result.current.edit("img-1", 1, "cash", "tampered"));
    expect(result.current.pages[0]!.entries[0]!.fields.cash.value).toBe("1500");
  });
});
