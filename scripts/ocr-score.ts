/**
 * ocr:score (M0060) — score OCR results against human ground truth.
 *
 * For every image that has BOTH ocr-samples/results/<branch>/<base>.json and
 * ocr-samples/expected/<base>.json, compares field-by-field and prints per-field
 * accuracy, service/med precision-recall, entry match rate, and a confidence
 * calibration table (§5). Writes ocr-samples/results/_report.json. Read-only,
 * no network. Run after `ocr:extract`.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateGroundTruth } from "@/services/ai/ground-truth-schema";
import { ocrPageExtractionSchema } from "@/services/ai/ocr-schema";
import { aggregate, scorePage, SCALAR_KEYS, type PageScore } from "@/services/ai/calibration/score";

function pct(correct: number, total: number): string {
  return total === 0 ? "—" : `${((correct / total) * 100).toFixed(0)}% (${correct}/${total})`;
}

function main(): void {
  const resultsDir = "ocr-samples/results";
  const expectedDir = "ocr-samples/expected";
  if (!existsSync(resultsDir)) {
    console.error(`No results dir (${resultsDir}) — run ocr:extract first.`);
    process.exitCode = 1;
    return;
  }

  const expected = new Map<string, string>();
  if (existsSync(expectedDir)) {
    for (const file of readdirSync(expectedDir)) {
      if (file.endsWith(".json") && !file.startsWith("_")) {
        expected.set(file.replace(/\.json$/, ""), path.join(expectedDir, file));
      }
    }
  }
  if (expected.size === 0) {
    console.log(
      "No ground-truth transcriptions in ocr-samples/expected — nothing to score. Add <image-basename>.json (see _TEMPLATE.json)."
    );
    return;
  }

  const scored: { base: string; branch: string; score: PageScore }[] = [];
  for (const branch of readdirSync(resultsDir)) {
    const bdir = path.join(resultsDir, branch);
    if (!existsSync(bdir) || !statSync(bdir).isDirectory()) continue;
    for (const file of readdirSync(bdir)) {
      if (!file.endsWith(".json") || file.startsWith("_")) continue;
      const base = file.replace(/\.json$/, "");
      const gtPath = expected.get(base);
      if (!gtPath) continue;

      const parsed = JSON.parse(readFileSync(path.join(bdir, file), "utf8")) as { extraction?: unknown };
      const extraction = ocrPageExtractionSchema.safeParse(parsed.extraction);
      if (!extraction.success) {
        console.error(`  ! ${base}: result extraction is not schema-valid — skipped`);
        continue;
      }
      const gt = validateGroundTruth(readFileSync(gtPath, "utf8"));
      if (!gt.valid || !gt.page) {
        console.error(`  ! ${base}: ground truth invalid — skipped`);
        continue;
      }
      scored.push({ base, branch, score: scorePage(extraction.data, gt.page) });
    }
  }

  if (scored.length === 0) {
    console.log(
      "No result/ground-truth pairs found (need the same <basename> under results/<branch>/ and expected/)."
    );
    return;
  }

  const total = aggregate(scored.map((s) => s.score));
  console.log(`\nScored ${scored.length} page(s) with ground truth.\n`);
  console.log("Per-field accuracy:");
  for (const key of SCALAR_KEYS) {
    console.log(`  ${key.padEnd(12)} ${pct(total.scalar[key].correct, total.scalar[key].total)}`);
  }
  console.log(
    `  ${"services".padEnd(12)} precision ${pct(total.services.matched, total.services.extracted)}  recall ${pct(total.services.matched, total.services.expected)}`
  );
  console.log(
    `  ${"meds".padEnd(12)} precision ${pct(total.meds.matched, total.meds.extracted)}  recall ${pct(total.meds.matched, total.meds.expected)}`
  );
  console.log(
    `\nEntries matched by line: ${total.entriesMatched}/${total.entriesExpected} expected (${total.entriesExtracted} extracted).`
  );
  console.log("\nConfidence calibration (scalar fields):");
  for (const bucket of total.buckets) {
    console.log(`  ${bucket.band.padEnd(22)} ${pct(bucket.correct, bucket.n)}`);
  }

  writeFileSync(
    path.join(resultsDir, "_report.json"),
    JSON.stringify(
      { scoredPages: scored.length, total, perImage: scored.map(({ base, branch, score }) => ({ base, branch, score })) },
      null,
      2
    ),
    "utf8"
  );
  console.log(`\nReport written to ${resultsDir}/_report.json`);
}

main();
