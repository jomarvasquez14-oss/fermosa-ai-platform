import { z } from "zod";

/**
 * Canonical OCR extraction schema (OCR_ARCHITECTURE.md §4).
 *
 * **schemaVersion 2 (M0059, ADR-040)** — "per-patient full", derived from the
 * REAL branch logbooks (189 samples): each patient row carries services WITH
 * amounts, staff, time in/out, cash/bank, meds bought, and points (BP/OP/NP),
 * not just the v1-assumed name/treatment/therapist/time. The daily financial
 * rollup is deliberately out of scope for v2 (a later schemaVersion). v1 is
 * retired — no persisted OcrResult referenced it (OCR pipeline never ran live).
 *
 * Every provider adapter must produce THIS shape; native structured-output
 * mechanisms are adapter details. Validated with Zod at the provider boundary;
 * consumers never see unvalidated provider output.
 */

/** The atom of the design: every extracted value carries its own uncertainty. */
export const extractedFieldSchema = z.object({
  /** Null when the field is unreadable or absent on the page. */
  value: z.string().nullable(),
  /** 0..1, provider-reported. Treated as ordinal until calibrated (§5). */
  confidence: z.number().min(0).max(1),
  /** Explicit "could not read" — distinct from low confidence. */
  unreadable: z.boolean(),
});
export type ExtractedField = z.infer<typeof extractedFieldSchema>;

/**
 * A named line item with a peso amount — one service rendered (Services column)
 * or one product sold (Meds column). Amount is transcribed AS WRITTEN (a string
 * like "1500"); numeric parsing happens at comparison time, never here.
 */
export const ocrLineItemSchema = z.object({
  name: extractedFieldSchema,
  amount: extractedFieldSchema,
});
export type OcrLineItem = z.infer<typeof ocrLineItemSchema>;

/** Loyalty-point columns as written per row (BP / OP / NP). */
export const ocrPointsSchema = z.object({
  bp: extractedFieldSchema,
  op: extractedFieldSchema,
  np: extractedFieldSchema,
});
export type OcrPoints = z.infer<typeof ocrPointsSchema>;

export const ocrEntrySchema = z.object({
  /** 1-based position on the page — review-UI and dedup anchor. */
  lineNumber: z.number().int().min(1),
  patientName: extractedFieldSchema,
  /** "Staff" column — who performed / recorded the row (v1's `therapist`). */
  staff: extractedFieldSchema,
  timeIn: extractedFieldSchema,
  timeOut: extractedFieldSchema,
  /** "#/SS" session marker, as written (e.g. "1st", "6/c"). */
  sessionNo: extractedFieldSchema,
  /** "Services" column — procedures rendered, each with its amount. */
  services: z.array(ocrLineItemSchema),
  /** "Meds" / "Meds/Soap" column — products sold, each with its amount. */
  meds: z.array(ocrLineItemSchema),
  cash: extractedFieldSchema,
  bank: extractedFieldSchema,
  points: ocrPointsSchema,
  /** Future: {x,y,w,h} normalized 0–1 for click-to-zoom review. */
  boundingBox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable(),
  /** min() of every leaf field confidence — weakest link, never an average. */
  entryConfidence: z.number().min(0).max(1),
});
export type OcrEntry = z.infer<typeof ocrEntrySchema>;

/**
 * Which half of the logbook this page is. Summary-only pages (the daily
 * financial rollup) legitimately carry ZERO `entries`; transaction pages carry
 * the per-patient rows; some photos capture both halves ("mixed").
 */
export const ocrPageTypeSchema = z.enum(["transaction", "summary", "mixed"]);
export type OcrPageType = z.infer<typeof ocrPageTypeSchema>;

export const ocrPageExtractionSchema = z.object({
  /** Evolve the shape without breaking persisted results. */
  schemaVersion: z.literal(2),
  /** Stamped by the orchestrator from displayOrder — never trusted from the model. */
  pageNumber: z.number().int().min(1),
  pageType: ocrPageTypeSchema,
  entries: z.array(ocrEntrySchema),
  /** Page areas the model gave up on — review UI must surface these. */
  unreadableRegions: z.array(
    z.object({ lineNumber: z.number().int().min(1).nullable(), reason: z.string() })
  ),
  /** min() over entries; drives confidence-band routing. */
  pageConfidence: z.number().min(0).max(1),
  /** Free-text provider observations. Never treated as data. */
  notes: z.string().nullable(),
});
export type OcrPageExtraction = z.infer<typeof ocrPageExtractionSchema>;

export interface OcrValidationResult {
  valid: boolean;
  extraction: OcrPageExtraction | null;
  /** Human-readable issues: JSON parse errors or schema violations, with paths. */
  issues: string[];
}

/** Validate a raw provider response (string) against the canonical schema. */
export function validateOcrExtraction(raw: string): OcrValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      valid: false,
      extraction: null,
      issues: [
        `Response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  const result = ocrPageExtractionSchema.safeParse(parsed);
  if (!result.success) {
    return {
      valid: false,
      extraction: null,
      issues: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
      ),
    };
  }
  return { valid: true, extraction: result.data, issues: [] };
}
