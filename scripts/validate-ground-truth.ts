/**
 * ocr:gt:check (M0059) — validate ground-truth transcriptions.
 *
 * Read-only. Checks every `ocr-samples/expected/*.json` (skipping `_TEMPLATE`
 * and any other `_`-prefixed file) against the ground-truth schema and exits
 * non-zero if any transcription is malformed. Usage:
 *   pnpm ocr:gt:check            (defaults to ocr-samples/expected)
 *   pnpm ocr:gt:check -- --dir <path>
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateGroundTruth } from "@/services/ai/ground-truth-schema";

function parseDir(argv: string[]): string {
  const tokens = argv.filter((token) => token !== "--");
  const i = tokens.indexOf("--dir");
  return i >= 0 && tokens[i + 1] ? tokens[i + 1]! : "ocr-samples/expected";
}

function main(): void {
  const dir = parseDir(process.argv.slice(2));
  if (!existsSync(dir)) {
    console.error(`No such directory: ${dir}`);
    process.exitCode = 1;
    return;
  }

  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json") && !file.startsWith("_"))
    .sort();

  if (files.length === 0) {
    console.log(
      `No transcriptions in ${dir} yet — name each <image-basename>.json; "_"-prefixed files are ignored.`
    );
    return;
  }

  let invalid = 0;
  for (const file of files) {
    const result = validateGroundTruth(readFileSync(path.join(dir, file), "utf8"));
    if (result.valid) {
      const n = result.page?.entries.length ?? 0;
      console.log(`  ok   ${file} (${result.page?.pageType}, ${n} entr${n === 1 ? "y" : "ies"})`);
    } else {
      invalid++;
      console.error(`  FAIL ${file}`);
      for (const issue of result.issues) console.error(`         ${issue}`);
    }
  }

  console.log(`\n${files.length - invalid}/${files.length} transcription(s) valid.`);
  process.exitCode = invalid > 0 ? 1 : 0;
}

main();
