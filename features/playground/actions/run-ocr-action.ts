"use server";

import { isAcceptedImageType, MAX_FILE_SIZE_BYTES } from "@/components/upload/validation";
import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { AI_PROVIDER_CATALOG, getAIProvider, type ExtractLogbookResult } from "@/services/ai";
import { PROMPT_VERSIONS } from "@/services/ai/prompts";

/**
 * AI Playground execution (Sprint 3.0) — Super Admin developer tooling.
 * Runs one OCR extraction through the AIProvider seam and returns the full
 * result for inspection. Nothing is persisted; the playground is deliberately
 * decoupled from the Audit Module.
 */

export type PlaygroundRunResult =
  { ok: true; data: ExtractLogbookResult } | { ok: false; error: string };

export async function runPlaygroundOcrAction(formData: FormData): Promise<PlaygroundRunResult> {
  try {
    await requirePermission("playground:access");

    const file = formData.get("file");
    const providerId = String(formData.get("provider") ?? "");
    const model = String(formData.get("model") ?? "");
    const promptVersion = String(formData.get("promptVersion") ?? "");

    if (!(file instanceof File)) return { ok: false, error: "Select an image first." };
    if (!isAcceptedImageType(file)) {
      return { ok: false, error: `"${file.name}" is not a supported image (JPG, PNG, HEIC).` };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: `"${file.name}" is larger than 10 MB.` };
    }

    const provider = AI_PROVIDER_CATALOG.find((entry) => entry.id === providerId);
    if (!provider) return { ok: false, error: "Unknown provider." };
    if (!provider.implemented) {
      return {
        ok: false,
        error: `${provider.label} is not implemented yet (Sprint 3.x). Use the mock provider.`,
      };
    }
    if (!provider.models.some((entry) => entry.id === model)) {
      return { ok: false, error: `Model "${model}" does not belong to ${provider.label}.` };
    }
    if (!PROMPT_VERSIONS.some((entry) => entry.id === promptVersion)) {
      return { ok: false, error: `Prompt version "${promptVersion}" is not registered.` };
    }

    const result = await getAIProvider(provider.id).extractLogbook({
      image: {
        data: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || "image/jpeg",
      },
      promptVersion,
      model,
    });

    return { ok: true, data: result };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    logger.error("Playground OCR run failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "The OCR run failed unexpectedly. Check the server logs." };
  }
}
