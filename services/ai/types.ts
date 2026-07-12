/**
 * AI layer contracts — provider-independent types.
 * Architecture only (Milestone 1.1): no provider implementations exist yet.
 */

/** Known providers. Adding one extends this union and the factory — nothing else. */
export const AI_PROVIDERS = ["openai-vision", "claude", "gemini", "azure-openai"] as const;
export type AIProviderId = (typeof AI_PROVIDERS)[number];

/** Reference to an image in object storage — providers never receive raw paths. */
export interface ImageRef {
  storageKey: string;
  mimeType?: string;
}

/**
 * One extracted logbook entry. Field names are intentionally generic
 * (`fields` map) until Milestone 2 fixes the logbook schema — provider
 * implementations must not invent their own entry shapes.
 */
export interface LogbookEntry {
  fields: Record<string, string>;
  /** 0..1 — provider's confidence for this entry as a whole. */
  confidence: number;
}

export interface LogbookExtraction {
  entries: LogbookEntry[];
  /** Full recognized text, for audit/debugging of the extraction itself. */
  rawText: string;
  /** 0..1 — overall document confidence. */
  confidence: number;
  warnings: string[];
}

export interface ImageAnalysis {
  description: string;
  labels: string[];
  /** 0..1 */
  confidence: number;
}

export interface SummaryInput {
  /** What is being summarized (shows up in prompts and logs). */
  subject: string;
  /** Source material — pre-assembled text, never raw DB entities. */
  content: string;
  maxLength?: number;
}

export interface SummaryResult {
  summary: string;
}

/** Common options accepted by every AI operation. */
export interface AIRequestOptions {
  /** Correlates provider calls with audit sessions / event streams. */
  correlationId?: string;
  signal?: AbortSignal;
}
