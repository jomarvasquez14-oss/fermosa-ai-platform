/**
 * Shared types for the reusable upload UI kit.
 *
 * Everything here is CLIENT-SIDE and EPHEMERAL by design (Sprint 2A.1):
 * images live in memory as object URLs and vanish on navigation. Persistence,
 * batches, and processing arrive in later sprints behind the service layer.
 */

export type ImageRotation = 0 | 90 | 180 | 270;

/** Client-side transfer state of an item (server truth is LogbookImageStatus). */
export type UploadItemState = "staged" | "uploading" | "stored" | "failed";

/** One image in the batch — freshly staged (has `file`) or persisted (has `serverId`). */
export interface UploadImageItem {
  /** Stable client-side id (never a database id). */
  id: string;
  /** Present for freshly selected files; absent for images loaded from the server. */
  file?: File;
  /** LogbookImage id once the image exists server-side (Sprint 2A.2). */
  serverId?: string;
  /** Object URL (staged) or authenticated API URL (persisted). */
  previewUrl: string;
  fileName: string;
  sizeBytes: number;
  /** Visual-only rotation applied via CSS transform. */
  rotation: ImageRotation;
  /**
   * False once the browser failed to decode the image (e.g. HEIC on
   * non-Safari browsers). The file itself stays in the batch.
   */
  previewable: boolean;
  uploadState: UploadItemState;
}

export const UPLOAD_REJECTION_REASONS = [
  "unsupported-type",
  "too-large",
  "duplicate",
  "limit-reached",
  "read-failure",
  "unknown",
] as const;

export type UploadRejectionReason = (typeof UPLOAD_REJECTION_REASONS)[number];

/** A single rejected file with a user-facing explanation. */
export interface UploadRejection {
  /** Stable id so individual messages can be dismissed. */
  id: string;
  fileName: string;
  reason: UploadRejectionReason;
  message: string;
}
