import "server-only";
import { getServerEnv } from "@/lib/config/env";
import { NotImplementedError } from "@/lib/errors";
import type { AIProvider } from "@/services/ai/ai-provider";
import { ClaudeVisionProvider } from "@/services/ai/providers/claude/claude-vision-provider";
import { MockAIProvider } from "@/services/ai/providers/mock/mock-provider";
import type { AIProviderId } from "@/services/ai/types";

export type { AIProvider } from "@/services/ai/ai-provider";
export * from "@/services/ai/types";
export * from "@/services/ai/ocr-schema";

const instances = new Map<AIProviderId, AIProvider>();

/**
 * AI provider factory — the single place a concrete provider is chosen.
 *
 * Selection order: explicit argument > `AI_PROVIDER` env var > default.
 * Implemented: mock (3.0), claude (3.1). Remaining providers land in 3.x and
 * add a case each. Unimplemented selections throw `NotImplementedError` so
 * accidental use fails loudly instead of silently.
 */
export function getAIProvider(id?: AIProviderId): AIProvider {
  const selected = id ?? getServerEnv().AI_PROVIDER;
  const cached = instances.get(selected);
  if (cached) return cached;

  let provider: AIProvider;
  switch (selected) {
    case "mock":
      provider = new MockAIProvider();
      break;
    case "claude":
      // Missing key fails gracefully at call time with a friendly AI_AUTH error.
      provider = new ClaudeVisionProvider(getServerEnv().ANTHROPIC_API_KEY);
      break;
    case "openai-vision":
    case "gemini":
    case "azure-openai":
      throw new NotImplementedError(`AI provider "${selected}"`, "Sprint 3.x");
  }

  instances.set(selected, provider);
  return provider;
}
