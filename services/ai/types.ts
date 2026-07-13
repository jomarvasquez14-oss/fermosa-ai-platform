import type { OcrPageExtraction } from "@/services/ai/ocr-schema";

/**
 * AI layer contracts — provider-independent types.
 * Contract refined for OCR in Sprint 3.0 per OCR_ARCHITECTURE.md §2
 * (pre-freeze refinement, ADR-015). The mock provider is the first
 * implementation; real providers land in Sprint 3.x.
 */

/** Known providers. Adding one extends this union and the factory — nothing else. */
export const AI_PROVIDERS = ["mock", "openai-vision", "claude", "gemini", "azure-openai"] as const;
export type AIProviderId = (typeof AI_PROVIDERS)[number];

export interface AIModelInfo {
  id: string;
  label: string;
  description?: string;
}

/**
 * Provider/model catalog for tooling (AI Playground, future admin screens).
 * `implemented: false` entries render disabled — visible so the roadmap is
 * honest, unselectable so nothing can call them.
 */
export const AI_PROVIDER_CATALOG: ReadonlyArray<{
  id: AIProviderId;
  label: string;
  implemented: boolean;
  models: readonly AIModelInfo[];
}> = [
  {
    id: "mock",
    label: "Mock (no API calls)",
    implemented: true,
    models: [
      {
        id: "mock-clean",
        label: "mock-clean",
        description: "High-confidence, fully readable page",
      },
      {
        id: "mock-messy",
        label: "mock-messy",
        description: "Low-confidence fields, unreadable regions — exercises review bands",
      },
      {
        id: "mock-malformed",
        label: "mock-malformed",
        description: "Returns schema-violating JSON — exercises validation errors",
      },
    ],
  },
  {
    id: "claude",
    label: "Anthropic Claude",
    implemented: true,
    models: [
      {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        description: "Best extraction quality — default for real OCR runs",
      },
      {
        id: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        description: "Faster and cheaper — for quality/cost comparison",
      },
    ],
  },
  {
    id: "openai-vision",
    label: "OpenAI",
    implemented: false,
    models: [{ id: "gpt-vision-latest", label: "GPT vision (latest)" }],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    implemented: false,
    models: [{ id: "gemini-latest", label: "Gemini (latest)" }],
  },
  {
    id: "azure-openai",
    label: "Azure OpenAI",
    implemented: false,
    models: [{ id: "azure-gpt-vision", label: "Azure GPT vision" }],
  },
];

/** Image payload for extraction — bytes are fetched by the orchestrator. */
export interface LogbookImageInput {
  data: Uint8Array;
  mimeType: string;
}

export interface ExtractLogbookInput {
  image: LogbookImageInput;
  /** Versioned prompt artifact, e.g. "logbook-extraction/v001" (OCR_ARCHITECTURE §3). */
  promptVersion: string;
  /** Provider-scoped model id; defaults to the provider's first catalog model. */
  model?: string;
}

/** Token/cost accounting — estimated for providers that do not report it. */
export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

/**
 * Full extraction result. `rawResponse` is always present (persisted later as
 * OcrResult.rawText); `extraction` is null exactly when validation failed.
 */
export interface ExtractLogbookResult {
  extraction: OcrPageExtraction | null;
  rawResponse: string;
  validation: { valid: boolean; issues: string[] };
  meta: {
    provider: AIProviderId;
    model: string;
    promptVersion: string;
    requestedAt: string; // ISO
    latencyMs: number;
    usage: AIUsage | null;
  };
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
