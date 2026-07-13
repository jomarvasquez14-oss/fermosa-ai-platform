import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  PlaygroundScreen,
  type PlaygroundCatalog,
} from "@/features/playground/components/playground-screen";
import { requirePermission } from "@/lib/auth/session";
import { AI_PROVIDER_CATALOG } from "@/services/ai";
import { PROMPT_VERSIONS } from "@/services/ai/prompts";

export const metadata: Metadata = {
  title: "AI Playground",
};

export default async function PlaygroundPage() {
  await requirePermission("playground:access");

  const catalog: PlaygroundCatalog = {
    providers: AI_PROVIDER_CATALOG.map((provider) => ({
      id: provider.id,
      label: provider.label,
      implemented: provider.implemented,
      models: provider.models.map((model) => ({ ...model })),
    })),
    prompts: PROMPT_VERSIONS.map((prompt) => ({
      id: prompt.id,
      description: prompt.description,
      draft: prompt.draft,
    })),
  };

  return (
    <>
      <PageHeader
        title="AI Playground"
        description="Internal developer tool: test OCR providers, models, and prompt versions against a single image. No data is persisted."
      />
      <PlaygroundScreen catalog={catalog} />
    </>
  );
}
