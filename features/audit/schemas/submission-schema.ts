import { z } from "zod";
import { MAX_IMAGES } from "@/components/upload/validation";

/**
 * Validation for the audit-submission workflow. Shared by client forms (UX)
 * and server actions (security) — one schema, two enforcement points.
 */

/** yyyy-mm-dd, valid calendar date, not in the future (local time). */
export const auditDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
  }, "The audit date cannot be in the future.");

export const createSubmissionSchema = z.object({
  auditDate: auditDateSchema,
  notes: z.string().trim().max(2000).optional(),
});
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const imageLayoutSchema = z.object({
  imageId: z.string().min(1),
  displayOrder: z.number().int().min(1).max(MAX_IMAGES),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});

export const saveDraftSchema = z.object({
  submissionId: z.string().min(1),
  auditDate: auditDateSchema,
  notes: z.string().trim().max(2000).optional(),
  images: z.array(imageLayoutSchema).max(MAX_IMAGES),
});
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
