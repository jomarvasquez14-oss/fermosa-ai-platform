/**
 * ocr:extract (M0060) — run the configured AI provider over the logbook images
 * and write one OCR result per image, for calibration against ground truth.
 *
 * Provider comes from AI_PROVIDER (mock default — deterministic fixtures, no
 * key, NOT a real read; set AI_PROVIDER=claude + ANTHROPIC_API_KEY for a live
 * run that spends tokens). Read-only over the images; resumable (skips existing
 * results unless --force).
 *
 *   pnpm ocr:extract -- --branch "Fermosa - Imus"
 *   AI_PROVIDER=claude pnpm ocr:extract -- --branch "Fermosa - Imus" --limit 3
 *   pnpm ocr:extract -- --all --force
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getAIProvider } from "@/services/ai";

const PROMPT = "logbook-extraction/v002";
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function loadDotEnv(): void {
  const file = path.resolve(".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2]!.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (process.env[match[1]!] === undefined) process.env[match[1]!] = value;
  }
}

function args() {
  const tokens = process.argv.slice(2).filter((token) => token !== "--");
  const get = (key: string) => {
    const i = tokens.indexOf(`--${key}`);
    return i >= 0 ? tokens[i + 1] : undefined;
  };
  return {
    all: tokens.includes("--all"),
    branch: get("branch"),
    model: get("model"),
    limit: get("limit") ? Number(get("limit")) : undefined,
    force: tokens.includes("--force"),
    branchesDir: get("branches") ?? "ocr-samples/branches",
    outDir: get("out") ?? "ocr-samples/results",
  };
}

async function main(): Promise<void> {
  loadDotEnv();
  const a = args();
  const provider = getAIProvider();
  const live = provider.id !== "mock";
  console.log(
    `AI provider: ${provider.id}${live ? " — LIVE (spends tokens)" : " (fixtures — NOT a real read)"}. Prompt ${PROMPT}.`
  );

  if (!existsSync(a.branchesDir)) {
    console.error(`No such directory: ${a.branchesDir}`);
    process.exitCode = 1;
    return;
  }
  const allBranches = readdirSync(a.branchesDir).filter((name) =>
    statSync(path.join(a.branchesDir, name)).isDirectory()
  );
  const branches = a.all ? allBranches : a.branch ? [a.branch] : [];
  if (branches.length === 0) {
    console.error("Pass --branch <name> or --all.");
    process.exitCode = 1;
    return;
  }

  let done = 0;
  let skipped = 0;
  let failed = 0;
  let costUsd = 0;

  for (const branch of branches) {
    const dir = path.join(a.branchesDir, branch);
    if (!existsSync(dir)) {
      console.error(`  ! no such branch dir: ${dir}`);
      continue;
    }
    let images = readdirSync(dir)
      .filter((file) => MIME[path.extname(file).toLowerCase()] !== undefined)
      .sort();
    if (a.limit !== undefined) images = images.slice(0, a.limit);
    const outBranch = path.join(a.outDir, branch);
    mkdirSync(outBranch, { recursive: true });

    for (const image of images) {
      const base = image.replace(/\.[^.]+$/, "");
      const outFile = path.join(outBranch, `${base}.json`);
      if (!a.force && existsSync(outFile)) {
        skipped++;
        continue;
      }
      const ext = path.extname(image).toLowerCase();
      const data = new Uint8Array(readFileSync(path.join(dir, image)));
      try {
        const result = await provider.extractLogbook({
          image: { data, mimeType: MIME[ext] ?? "image/jpeg" },
          promptVersion: PROMPT,
          model: a.model,
        });
        writeFileSync(
          outFile,
          JSON.stringify(
            {
              image,
              branch,
              provider: result.meta.provider,
              model: result.meta.model,
              promptVersion: result.meta.promptVersion,
              valid: result.validation.valid,
              issues: result.validation.issues,
              usage: result.meta.usage,
              latencyMs: result.meta.latencyMs,
              extraction: result.extraction,
            },
            null,
            2
          ),
          "utf8"
        );
        costUsd += result.meta.usage?.estimatedCostUsd ?? 0;
        done++;
        if (!result.validation.valid) {
          console.error(`\n  ! ${branch}/${image}: schema-invalid (${result.validation.issues[0] ?? "?"})`);
        }
        process.stderr.write(
          `\r  ${branch}: ${done} done, ${skipped} skipped, ${failed} failed — ~$${costUsd.toFixed(4)}        `
        );
      } catch (error) {
        failed++;
        console.error(`\n  ✗ ${branch}/${image}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    process.stderr.write("\n");
  }

  console.log(
    `\nExtracted ${done}, skipped ${skipped}, failed ${failed}. Estimated cost ~$${costUsd.toFixed(4)}. Results under ${a.outDir}/<branch>/.`
  );
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error("ocr:extract failed:", error);
  process.exitCode = 1;
});
