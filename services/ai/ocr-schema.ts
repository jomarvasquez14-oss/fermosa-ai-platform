import { z } from "zod";

/**
 * Canonical OCR extraction schema (OCR_ARCHITECTURE.md §4).
 *
 * Every provider adapter must produce THIS shape — native structured-output
 * mechanisms are adapter details. Validated with Zod at the provider
 * boundary; consumers never see unvalidated provider output.
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

export const ocrEntrySchema = z.object({
  /** 1-based position on the page — review-UI and dedup anchor. */
  lineNumber: z.number().int().min(1),
  patientName: extractedFieldSchema,
  treatment: extractedFieldSchema,
  therapist: extractedFieldSchema,
  time: extractedFieldSchema,
  /** Future: {x,y,w,h} normalized 0–1 for click-to-zoom review. */
  boundingBox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable(),
  /** min() of field confidences — weakest link, never an average. */
  entryConfidence: z.number().min(0).max(1),
});
export type OcrEntry = z.infer<typeof ocrEntrySchema>;

export const ocrPageExtractionSchema = z.object({
  /** Evolve the shape without breaking persisted results. */
  schemaVersion: z.literal(1),
  /** Stamped by the orchestrator from displayOrder — never trusted from the model. */
  pageNumber: z.number().int().min(1),
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
