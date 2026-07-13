/**
 * Reusable upload UI kit (Sprint 2A.1).
 * Client-side only: staging, validation, and review of image batches.
 * Persistence and processing belong to later sprints — nothing here may
 * import services or Prisma.
 */

export { UploadDropzone } from "./upload-dropzone";
export { ImageCard } from "./image-card";
export { ImageSorter } from "./image-sorter";
export { ImagePreviewDialog } from "./image-preview-dialog";
export { UploadToolbar } from "./upload-toolbar";
export { UploadRejections } from "./upload-rejections";
export * from "./types";
export {
  ACCEPTED_IMAGE_EXTENSIONS,
  ACCEPTED_IMAGE_MIME_TYPES,
  FILE_INPUT_ACCEPT,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGES,
  validateFiles,
} from "./validation";
