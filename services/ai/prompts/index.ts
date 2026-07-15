import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { AppError } from "@/lib/errors";

/**
 * Prompt artifact registry (OCR_ARCHITECTURE.md §3).
 *
 * Prompt content lives in versioned, immutable `.md` files next to this
 * module. The registry below is the explicit catalog: a version is selectable
 * only once listed here, and listing is a code change — so prompt rollout is
 * always reviewable.
 */

export interface PromptVersionInfo {
  /** Full identifier recorded on every request, e.g. "logbook-extraction/v001". */
  id: string;
  family: string;
  version: string;
  description: string;
  /** Draft prompts are usable in tooling but flagged in UIs. */
  draft: boolean;
}

export const PROMPT_VERSIONS: readonly PromptVersionInfo[] = [
  {
    id: "logbook-extraction/v001",
    family: "logbook-extraction",
    version: "v001",
    description: "Initial draft — assumed patient/treatment/therapist/time columns",
    draft: true,
  },
  {
    id: "logbook-extraction/v002",
    family: "logbook-extraction",
    version: "v002",
    description:
      "Per-patient full (schema v2, M0059) — real columns: services+amounts, staff, time in/out, #/SS, cash/bank, meds, BP/OP/NP",
    draft: false,
  },
];

const VALID_SEGMENT = /^[a-z0-9-]+$/;

/** Load a prompt artifact's content. Only registered versions are loadable. */
export async function loadPrompt(promptVersionId: string): Promise<string> {
  const info = PROMPT_VERSIONS.find((p) => p.id === promptVersionId);
  if (!info || !VALID_SEGMENT.test(info.family) || !VALID_SEGMENT.test(info.version)) {
    throw new AppError("PROMPT_UNKNOWN", `Prompt version "${promptVersionId}" is not registered.`);
  }
  const file = path.join(
    process.cwd(),
    "services",
    "ai",
    "prompts",
    info.family,
    `${info.version}.md`
  );
  return fs.readFile(file, "utf8");
}
