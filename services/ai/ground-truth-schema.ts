import { z } from "zod";

/**
 * Ground-truth schema (M0059) — the human transcription an OCR run is scored
 * against. It is the **bare-value mirror** of the OCR v2 output schema
 * (`ocr-schema.ts`): the same fields, but plain values with NO confidence
 * wrappers, because ground truth is truth, not a guess. `null` means the value
 * is genuinely illegible or absent on the page.
 *
 * Lives beside the OCR schema so the two never drift; consumed by the
 * `ocr:gt:check` CLI and the M0060 calibration scorer. No `server-only` —
 * transcriptions are plain files under `ocr-samples/expected/` (gitignored PII).
 */

const gtLineItemSchema = z.object({
  name: z.string().nullable(),
  amount: z.string().nullable(),
});

const gtPointsSchema = z.object({
  bp: z.string().nullable(),
  op: z.string().nullable(),
  np: z.string().nullable(),
});

export const groundTruthEntrySchema = z.object({
  lineNumber: z.number().int().min(1),
  patientName: z.string().nullable(),
  staff: z.string().nullable(),
  timeIn: z.string().nullable(),
  timeOut: z.string().nullable(),
  sessionNo: z.string().nullable(),
  services: z.array(gtLineItemSchema),
  meds: z.array(gtLineItemSchema),
  cash: z.string().nullable(),
  bank: z.string().nullable(),
  points: gtPointsSchema,
});
export type GroundTruthEntry = z.infer<typeof groundTruthEntrySchema>;

export const groundTruthPageSchema = z.object({
  /** Free-text note for transcribers; ignored by scoring. */
  _instructions: z.string().optional(),
  /** Optional provenance, ignored by scoring. */
  branch: z.string().optional(),
  date: z.string().nullable().optional(),
  pageType: z.enum(["transaction", "summary", "mixed"]),
  entries: z.array(groundTruthEntrySchema),
});
export type GroundTruthPage = z.infer<typeof groundTruthPageSchema>;

export interface GroundTruthValidationResult {
  valid: boolean;
  page: GroundTruthPage | null;
  issues: string[];
}

/** Validate one transcription file's contents against the ground-truth schema. */
export function validateGroundTruth(raw: string): GroundTruthValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      valid: false,
      page: null,
      issues: [`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  const result = groundTruthPageSchema.safeParse(parsed);
  if (!result.success) {
    return {
      valid: false,
      page: null,
      issues: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
      ),
    };
  }
  return { valid: true, page: result.data, issues: [] };
}
