/**
 * OCR review kit (Sprint 3.3) — reusable, submission-agnostic components.
 * State lives in `hooks/use-ocr-review`; these components only render + emit.
 */
export * from "./types";
export * from "./confidence";
export { ConfidenceBadge } from "./confidence-badge";
export { OCRField } from "./ocr-field";
export { OCRImageViewer } from "./ocr-image-viewer";
export { OCRReviewPanel } from "./ocr-review-panel";
export { OCRSummary } from "./ocr-summary";
export { OCRNavigation } from "./ocr-navigation";
