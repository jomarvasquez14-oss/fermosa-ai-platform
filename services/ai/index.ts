import "server-only";
import { getServerEnv } from "@/lib/config/env";
import { NotImplementedError } from "@/lib/errors";
import type { AIProvider } from "@/services/ai/ai-provider";
import type { AIProviderId } from "@/services/ai/types";

export type { AIProvider } from "@/services/ai/ai-provider";
export * from "@/services/ai/types";

/**
 * AI provider factory — the single place a concrete provider is chosen.
 *
 * Selection order: explicit argument > `AI_PROVIDER` env var > default.
 * When implementations land (Milestone 3), each case returns its provider;
 * until then every path throws `NotImplementedError` so accidental use fails
 * loudly instead of silently.
 */
export function getAIProvider(id?: AIProviderId): AIProvider {
  const selected = id ?? getServerEnv().AI_PROVIDER;

  switch (selected) {
    case "openai-vision":
      // return new OpenAIVisionProvider()  — Milestone 3
      throw new NotImplementedError(`AI provider "${selected}"`, "Milestone 3");
    case "claude":
    case "gemini":
    case "azure-openai":
      throw new NotImplementedError(`AI provider "${selected}"`, "post-M3");
  }
}
