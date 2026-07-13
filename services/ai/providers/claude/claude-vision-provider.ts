import Anthropic from "@anthropic-ai/sdk";
import { AppError, NotImplementedError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AIProvider } from "@/services/ai/ai-provider";
import { validateOcrExtraction } from "@/services/ai/ocr-schema";
import { loadPrompt } from "@/services/ai/prompts";
import type {
  AIRequestOptions,
  AIUsage,
  ExtractLogbookInput,
  ExtractLogbookResult,
  ImageAnalysis,
  LogbookImageInput,
  SummaryInput,
  SummaryResult,
} from "@/services/ai/types";

/**
 * Anthropic Claude vision provider (Sprint 3.1) — the first REAL AIProvider.
 *
 * Playground-only for now: nothing in the audit workflow calls this. The
 * adapter owns everything Claude-specific — SDK, model ids, image limits,
 * fence-stripping, error shapes — per PROJECT_RULES 20 nothing outside
 * `services/ai/` may know these details.
 */

const DEFAULT_MODEL = "claude-sonnet-5";

/** Claude's vision input constraints (checked before spending a request). */
const SUPPORTED_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 4096;

/**
 * USD per million tokens (input, output). Snapshot of published prices —
 * estimation only; authoritative spend comes from the provider invoice.
 * Moves to versioned config with AiUsageRecord (OCR_ARCHITECTURE §9).
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

function estimateUsage(model: string, inputTokens: number, outputTokens: number): AIUsage {
  const price = PRICE_PER_MTOK[model] ?? { input: 3, output: 15 };
  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: Number(
      ((inputTokens * price.input + outputTokens * price.output) / 1_000_000).toFixed(6)
    ),
  };
}

/**
 * Models are told to answer with bare JSON, but they sometimes wrap it in
 * markdown fences anyway. Stripping fences is boundary translation, not
 * repair — the raw response is preserved verbatim alongside.
 */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return match?.[1] ?? trimmed;
}

/** Map SDK/network failures to friendly, provider-neutral AppErrors. */
function mapProviderError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const status = (error as { status?: number }).status;
  const name = error instanceof Error ? error.name : "";

  if (status === 401 || status === 403) {
    return new AppError(
      "AI_AUTH",
      "Claude rejected the API key. Check ANTHROPIC_API_KEY in the server environment."
    );
  }
  if (status === 429) {
    return new AppError(
      "AI_RATE_LIMIT",
      "Claude is rate-limiting requests right now. Wait a moment and try again."
    );
  }
  if (status === 529 || (status !== undefined && status >= 500)) {
    return new AppError(
      "AI_PROVIDER",
      "Claude is temporarily unavailable (provider-side error). Try again shortly."
    );
  }
  if (name === "APIConnectionTimeoutError" || name === "AbortError") {
    return new AppError(
      "AI_TIMEOUT",
      `Claude did not answer within ${REQUEST_TIMEOUT_MS / 1000}s. Try again, or use a smaller image.`
    );
  }
  if (status === 400) {
    return new AppError(
      "AI_BAD_REQUEST",
      "Claude rejected the request — the image may be corrupt or in an unsupported format."
    );
  }

  logger.error("Unmapped Claude provider error", {
    name,
    status,
    message: error instanceof Error ? error.message : String(error),
  });
  return new AppError("AI_PROVIDER", "The Claude request failed unexpectedly. Check server logs.");
}

export class ClaudeVisionProvider implements AIProvider {
  readonly id = "claude" as const;
  private readonly apiKey: string | undefined;
  private client: Anthropic | null = null;

  constructor(apiKey: string | undefined) {
    this.apiKey = apiKey;
  }

  private getClient(): Anthropic {
    if (!this.apiKey) {
      throw new AppError(
        "AI_AUTH",
        "No Anthropic API key is configured. Set ANTHROPIC_API_KEY in the server environment to use the Claude provider."
      );
    }
    this.client ??= new Anthropic({ apiKey: this.apiKey, timeout: REQUEST_TIMEOUT_MS });
    return this.client;
  }

  async extractLogbook(
    input: ExtractLogbookInput,
    options?: AIRequestOptions
  ): Promise<ExtractLogbookResult> {
    const model = input.model ?? DEFAULT_MODEL;
    const mediaType = input.image.mimeType as (typeof SUPPORTED_MEDIA)[number];

    if (!SUPPORTED_MEDIA.includes(mediaType)) {
      throw new AppError(
        "AI_BAD_IMAGE",
        `Claude does not accept ${input.image.mimeType || "this file type"} images. Use JPG, PNG, or WEBP (HEIC must be converted first).`
      );
    }
    if (input.image.data.byteLength > MAX_IMAGE_BYTES) {
      throw new AppError(
        "AI_BAD_IMAGE",
        "Claude accepts images up to 5 MB. Downscale or re-compress this image first."
      );
    }

    const client = this.getClient();
    const systemPrompt = await loadPrompt(input.promptVersion);
    const requestedAt = new Date().toISOString();
    const startedAt = Date.now();

    let response: Anthropic.Message;
    try {
      response = await client.messages.create(
        {
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: Buffer.from(input.image.data).toString("base64"),
                  },
                },
                {
                  type: "text",
                  text: "Extract this logbook page now. Respond with only the JSON object.",
                },
              ],
            },
          ],
        },
        { signal: options?.signal }
      );
    } catch (error) {
      throw mapProviderError(error);
    }
    const latencyMs = Date.now() - startedAt;

    const rawResponse = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    // Validation is the schema gate (OCR_ARCHITECTURE §7): malformed output
    // becomes a structured validation failure, never an exception or UI leak.
    const validation = validateOcrExtraction(stripFences(rawResponse));

    return {
      extraction: validation.extraction,
      rawResponse,
      validation: { valid: validation.valid, issues: validation.issues },
      meta: {
        provider: this.id,
        model,
        promptVersion: input.promptVersion,
        requestedAt,
        latencyMs,
        usage: estimateUsage(model, response.usage.input_tokens, response.usage.output_tokens),
      },
    };
  }

  async analyzeImage(_image: LogbookImageInput): Promise<ImageAnalysis> {
    throw new NotImplementedError("ClaudeVisionProvider.analyzeImage", "when a caller exists");
  }

  async generateSummary(_input: SummaryInput): Promise<SummaryResult> {
    throw new NotImplementedError("ClaudeVisionProvider.generateSummary", "when a caller exists");
  }
}
