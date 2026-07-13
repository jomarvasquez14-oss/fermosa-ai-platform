"use server";

import { revalidatePath } from "next/cache";
import { isAcceptedImageType, MAX_FILE_SIZE_BYTES } from "@/components/upload/validation";
import {
  createSubmissionSchema,
  saveDraftSchema,
  type CreateSubmissionInput,
  type SaveDraftInput,
} from "@/features/audit/schemas/submission-schema";
import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";
import { getStorageProvider } from "@/services/storage";

/**
 * Server actions for the audit-submission workflow (Sprint 2A.2).
 * Every action re-validates input (client validation is UX, not security),
 * derives the actor from the session, and delegates invariants to the
 * service layer. Uploads are one action call per image so a single failure
 * never forces restarting the batch.
 */

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function getUploadActor(): Promise<Actor> {
  const user = await requirePermission("audit:upload");
  return { id: user.id, role: user.role, branchId: user.branchId ?? null };
}

function toError(error: unknown, fallback: string): { ok: false; error: string } {
  if (isAppError(error)) return { ok: false, error: error.message };
  logger.error(fallback, { error: error instanceof Error ? error.message : String(error) });
  return { ok: false, error: fallback };
}

function storageKeyFor(submissionId: string, imageId: string): string {
  return `submissions/${submissionId}/${imageId}`;
}

export async function createDraftAction(
  input: CreateSubmissionInput
): Promise<ActionResult<{ submissionId: string }>> {
  try {
    const actor = await getUploadActor();
    const parsed = createSubmissionSchema.parse(input);
    const submission = await auditSubmissionService.createDraft(actor, {
      // UTC midnight: auditDate is a calendar date (@db.Date) — parsing as
      // local time would shift it a day back in UTC+ timezones.
      auditDate: new Date(`${parsed.auditDate}T00:00:00Z`),
      notes: parsed.notes,
    });
    revalidatePath("/audit");
    return { ok: true, data: { submissionId: submission.id } };
  } catch (error) {
    return toError(error, "Could not create the submission. Please try again.");
  }
}

/**
 * Upload one image: register metadata (stable image id is born server-side),
 * store the binary, then confirm. Metadata survives storage failures so the
 * upload can be retried individually.
 */
export async function uploadImageAction(
  formData: FormData
): Promise<ActionResult<{ imageId: string; status: "STORED" | "UPLOAD_FAILED" }>> {
  let imageId: string | null = null;
  try {
    const actor = await getUploadActor();
    const submissionId = String(formData.get("submissionId") ?? "");
    const rotation = Number(formData.get("rotation") ?? 0);
    const file = formData.get("file");

    if (!submissionId || !(file instanceof File)) {
      return { ok: false, error: "Invalid upload request." };
    }
    if (!isAcceptedImageType(file)) {
      return { ok: false, error: `"${file.name}" is not a supported image (JPG, PNG, HEIC).` };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: `"${file.name}" is larger than 10 MB.` };
    }

    const image = await auditSubmissionService.addImage(actor, submissionId, {
      originalFileName: file.name,
      mimeType: file.type || undefined,
      fileSizeBytes: file.size,
      rotation: [0, 90, 180, 270].includes(rotation) ? rotation : 0,
    });
    imageId = image.id;

    try {
      await getStorageProvider().put(
        storageKeyFor(submissionId, image.id),
        Buffer.from(await file.arrayBuffer()),
        { contentType: file.type || undefined }
      );
      await auditSubmissionService.markImageStored(
        actor,
        image.id,
        storageKeyFor(submissionId, image.id)
      );
      return { ok: true, data: { imageId: image.id, status: "STORED" } };
    } catch (storageError) {
      logger.error("Image upload failed at storage", {
        imageId: image.id,
        error: storageError instanceof Error ? storageError.message : String(storageError),
      });
      await auditSubmissionService.markImageFailed(actor, image.id);
      return { ok: true, data: { imageId: image.id, status: "UPLOAD_FAILED" } };
    }
  } catch (error) {
    void imageId;
    return toError(error, "Could not upload the image. Please try again.");
  }
}

/** Retry the binary transfer for an image whose metadata already exists. */
export async function retryImageUploadAction(
  formData: FormData
): Promise<ActionResult<{ imageId: string; status: "STORED" | "UPLOAD_FAILED" }>> {
  try {
    const actor = await getUploadActor();
    const imageId = String(formData.get("imageId") ?? "");
    const file = formData.get("file");
    if (!imageId || !(file instanceof File)) {
      return { ok: false, error: "Invalid retry request." };
    }

    const image = await auditSubmissionService.getImage(actor, imageId);
    await auditSubmissionService.markImageUploading(actor, imageId);
    try {
      await getStorageProvider().put(
        storageKeyFor(image.submissionId, imageId),
        Buffer.from(await file.arrayBuffer()),
        { contentType: file.type || undefined }
      );
      await auditSubmissionService.markImageStored(
        actor,
        imageId,
        storageKeyFor(image.submissionId, imageId)
      );
      return { ok: true, data: { imageId, status: "STORED" } };
    } catch {
      await auditSubmissionService.markImageFailed(actor, imageId);
      return { ok: true, data: { imageId, status: "UPLOAD_FAILED" } };
    }
  } catch (error) {
    return toError(error, "Could not retry the upload. Please try again.");
  }
}

export async function removeImageAction(imageId: string): Promise<ActionResult> {
  try {
    const actor = await getUploadActor();
    const { storageKey } = await auditSubmissionService.removeImage(actor, imageId);
    if (storageKey) {
      // Best-effort blob GC — the DB row is already gone; an orphaned blob is
      // harmless and cleanable, a dangling row is not.
      try {
        await getStorageProvider().delete(storageKey);
      } catch (gcError) {
        logger.warn("Failed to delete stored blob for removed image", {
          imageId,
          error: gcError instanceof Error ? gcError.message : String(gcError),
        });
      }
    }
    return { ok: true, data: undefined };
  } catch (error) {
    return toError(error, "Could not remove the image. Please try again.");
  }
}

export async function saveDraftAction(input: SaveDraftInput): Promise<ActionResult> {
  try {
    const actor = await getUploadActor();
    const parsed = saveDraftSchema.parse(input);
    await auditSubmissionService.saveDraft(actor, parsed.submissionId, {
      auditDate: new Date(`${parsed.auditDate}T00:00:00Z`),
      notes: parsed.notes,
      images: parsed.images,
    });
    revalidatePath("/audit");
    revalidatePath(`/audit/${parsed.submissionId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return toError(error, "Could not save the draft. Please try again.");
  }
}

export async function submitSubmissionAction(submissionId: string): Promise<ActionResult> {
  try {
    const actor = await getUploadActor();
    await auditSubmissionService.submit(actor, submissionId);
    revalidatePath("/audit");
    revalidatePath(`/audit/${submissionId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return toError(error, "Could not submit. Please try again.");
  }
}
