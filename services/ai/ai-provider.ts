import type {
  AIProviderId,
  AIRequestOptions,
  ImageAnalysis,
  ImageRef,
  LogbookExtraction,
  SummaryInput,
  SummaryResult,
} from "@/services/ai/types";

/**
 * Provider-independent AI interface (dependency inversion seam).
 *
 * The application depends ONLY on this interface; concrete providers
 * (OpenAI Vision first; Claude, Gemini, Azure OpenAI later) implement it and
 * are selected by the factory in `services/ai/index.ts`. No application code
 * outside that factory may reference a provider SDK or provider name.
 *
 * Implementations must:
 *  - be stateless per call (safe to share one instance),
 *  - normalize provider errors into `AppError` subclasses,
 *  - emit no events themselves — orchestration (the audit pipeline) does.
 */
export interface AIProvider {
  readonly id: AIProviderId;

  /** OCR + structure a scanned logbook page into entries. */
  extractLogbook(image: ImageRef, options?: AIRequestOptions): Promise<LogbookExtraction>;

  /** General-purpose vision analysis (quality checks, page classification). */
  analyzeImage(image: ImageRef, options?: AIRequestOptions): Promise<ImageAnalysis>;

  /** Natural-language summary of prepared content (e.g. an audit report digest). */
  generateSummary(input: SummaryInput, options?: AIRequestOptions): Promise<SummaryResult>;
}
