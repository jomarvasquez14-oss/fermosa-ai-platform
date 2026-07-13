import type { OcrPageExtraction } from "@/services/ai/ocr-schema";
import { AUTO_ACCEPT_THRESHOLD } from "./confidence";
import { REVIEW_FIELD_KEYS, type ReviewPage } from "./types";

/**
 * Build initial review pages from raw extractions (OCR_ARCHITECTURE §5):
 * ≥ 0.95 starts pre-accepted; model-unreadable fields start pending so a
 * human explicitly confirms illegibility.
 *
 * Pure and isomorphic — server pages build the initial state, the client
 * hook owns it from there.
 */
export function buildReviewPages(
  extractions: Array<{ imageId: string; fileName: string; extraction: OcrPageExtraction }>
): ReviewPage[] {
  return extractions.map(({ imageId, fileName, extraction }, index) => ({
    imageId,
    fileName,
    pageNumber: index + 1,
    pageConfidence: extraction.pageConfidence,
    notes: extraction.notes,
    unreadableRegions: extraction.unreadableRegions,
    confirmed: false,
    entries: extraction.entries.map((entry) => ({
      lineNumber: entry.lineNumber,
      fields: Object.fromEntries(
        REVIEW_FIELD_KEYS.map((key) => {
          const source = entry[key];
          return [
            key,
            {
              key,
              originalValue: source.value,
              value: source.value,
              confidence: source.confidence,
              modelUnreadable: source.unreadable,
              status:
                !source.unreadable &&
                source.value !== null &&
                source.confidence >= AUTO_ACCEPT_THRESHOLD
                  ? ("accepted" as const)
                  : ("pending" as const),
            },
          ];
        })
      ) as ReviewPage["entries"][number]["fields"],
    })),
  }));
}
