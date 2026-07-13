import type { UploadImageItem, UploadRejection, UploadRejectionReason } from "./types";

/**
 * Client-side validation for staged uploads (Sprint 2A.1 scope).
 * Pure functions — no DOM, no state — so they are unit-testable and reusable
 * verbatim when server-side validation arrives in a later sprint.
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGES = 20;

/**
 * Accepted logbook image formats. HEIC/HEIF is accepted at selection time
 * ("if supported"): decoding is attempted and the card falls back to a
 * no-preview state on browsers that cannot render it.
 */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
] as const;

export const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".heic", ".heif"] as const;

/** Value for `<input accept>`: mime types plus extensions for picky pickers. */
export const FILE_INPUT_ACCEPT = [...ACCEPTED_IMAGE_MIME_TYPES, ...ACCEPTED_IMAGE_EXTENSIONS].join(
  ","
);

/**
 * Duplicate detection key. Name + size + lastModified identifies "the same
 * file picked twice" without reading file contents (hashing 10 MB files on
 * the client would block the main thread for no UX gain at this stage).
 */
export function fileIdentity(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function isAcceptedImageType(file: File): boolean {
  if ((ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type.toLowerCase())) {
    return true;
  }
  // Some platforms (notably Windows for HEIC) report an empty or generic mime
  // type — fall back to the extension.
  const name = file.name.toLowerCase();
  return ACCEPTED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export interface FileValidationResult {
  accepted: File[];
  rejected: Array<{ file: File; reason: UploadRejectionReason; message: string }>;
}

/**
 * Validate a candidate selection against the current batch.
 * Files are judged INDIVIDUALLY — one bad file never rejects the rest.
 */
/** Identity for items already in the batch — persisted items have no File. */
function itemIdentity(item: UploadImageItem): string {
  return item.file ? fileIdentity(item.file) : `${item.fileName}::${item.sizeBytes}`;
}

export function validateFiles(
  candidates: readonly File[],
  existing: readonly UploadImageItem[]
): FileValidationResult {
  const result: FileValidationResult = { accepted: [], rejected: [] };
  const seen = new Set(existing.map(itemIdentity));
  // Persisted items match on name+size (lastModified is lost server-side).
  const seenLoose = new Set(existing.map((item) => `${item.fileName}::${item.sizeBytes}`));
  let slotsLeft = MAX_IMAGES - existing.length;

  for (const file of candidates) {
    if (!isAcceptedImageType(file)) {
      result.rejected.push({
        file,
        reason: "unsupported-type",
        message: `"${file.name}" is not a supported image. Please use JPG, PNG, or HEIC.`,
      });
      continue;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      result.rejected.push({
        file,
        reason: "too-large",
        message: `"${file.name}" is larger than 10 MB. Try a smaller photo or a lower camera resolution.`,
      });
      continue;
    }
    const identity = fileIdentity(file);
    if (seen.has(identity) || seenLoose.has(`${file.name}::${file.size}`)) {
      result.rejected.push({
        file,
        reason: "duplicate",
        message: `"${file.name}" is already in this batch.`,
      });
      continue;
    }
    if (slotsLeft <= 0) {
      result.rejected.push({
        file,
        reason: "limit-reached",
        message: `"${file.name}" was skipped — a batch can hold up to ${MAX_IMAGES} images.`,
      });
      continue;
    }
    seen.add(identity);
    seenLoose.add(`${file.name}::${file.size}`);
    slotsLeft -= 1;
    result.accepted.push(file);
  }

  return result;
}

/** User-facing message for failures that happen outside validateFiles. */
export function rejectionMessage(reason: UploadRejectionReason, fileName: string): string {
  switch (reason) {
    case "read-failure":
      return `"${fileName}" could not be read by your browser. Please try selecting it again.`;
    case "unknown":
      return `Something went wrong adding "${fileName}". Please try again.`;
    case "unsupported-type":
      return `"${fileName}" is not a supported image. Please use JPG, PNG, or HEIC.`;
    case "too-large":
      return `"${fileName}" is larger than 10 MB.`;
    case "duplicate":
      return `"${fileName}" is already in this batch.`;
    case "limit-reached":
      return `"${fileName}" was skipped — a batch can hold up to ${MAX_IMAGES} images.`;
  }
}

/** Build a UploadRejection with a stable id (for dismissible error lists). */
export function toRejection(
  fileName: string,
  reason: UploadRejectionReason,
  message?: string
): UploadRejection {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fileName,
    reason,
    message: message ?? rejectionMessage(reason, fileName),
  };
}
