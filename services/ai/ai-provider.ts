import type {
  AIProviderId,
  AIRequestOptions,
  ExtractLogbookInput,
  ExtractLogbookResult,
  ImageAnalysis,
  LogbookImageInput,
  SummaryInput,
  SummaryResult,
} from "@/services/ai/types";

/**
 * Provider-independent AI interface (dependency inversion seam).
 *
 * The application depends ONLY on this interface; concrete providers
 * (mock first — Sprint 3.0; Claude, OpenAI, Gemini, Azure OpenAI later)
 * implement it and are selected by the factory in `services/ai/index.ts`.
 * No application code outside that factory may reference a provider SDK or
 * provider name.
 *
 * Implementations must:
 *  - be stateless per call (safe to share one instance),
 *  - produce the canonical OCR schema (`services/ai/ocr-schema.ts`) — native
 *    structured-output mechanisms are adapter details (OCR_ARCHITECTURE §2),
 *  - always return `rawResponse`, even (especially) when validation fails,
 *  - normalize provider errors into `AppError` subclasses,
 *  - emit no events themselves — orchestration (the audit pipeline) does.
 */
export interface AIProvider {
  readonly id: AIProviderId;

  /** OCR + structure a scanned logbook page (OCR_ARCHITECTURE §1 steps 3–5). */
  extractLogbook(
    input: ExtractLogbookInput,
    options?: AIRequestOptions
  ): Promise<ExtractLogbookResult>;

  /** General-purpose vision analysis (quality checks, page classification). */
  analyzeImage(image: LogbookImageInput, options?: AIRequestOptions): Promise<ImageAnalysis>;

  /** Natural-language summary of prepared content (e.g. an audit report digest). */
  generateSummary(input: SummaryInput, options?: AIRequestOptions): Promise<SummaryResult>;
}
