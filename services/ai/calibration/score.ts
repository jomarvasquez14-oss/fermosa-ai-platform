import type { OcrEntry, OcrPageExtraction } from "@/services/ai/ocr-schema";
import type { GroundTruthEntry, GroundTruthPage } from "@/services/ai/ground-truth-schema";

/**
 * OCR calibration scorer (M0060) — pure, no IO. Compares one OCR extraction
 * against its human ground truth, field by field, and buckets OCR confidence
 * by correctness (OCR_ARCHITECTURE §5, the "calibration set for free" idea).
 * The extraction runner and CLIs do the file IO around this.
 */

export const SCALAR_KEYS = [
  "patientName",
  "staff",
  "timeIn",
  "timeOut",
  "sessionNo",
  "cash",
  "bank",
] as const;
export type ScalarKey = (typeof SCALAR_KEYS)[number];

/** Transcription-tolerant compare: trim, lowercase, collapse spaces; numbers
 *  lose currency signs / thousands separators. `null`/blank collapse to null. */
export function normalizeValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (text === "") return null;
  const numeric = text.replace(/[₱,]/g, "");
  return /^\d+(\.\d+)?$/.test(numeric) ? String(Number(numeric)) : text;
}

function valuesMatch(a: string | null, b: string | null): boolean {
  return normalizeValue(a) === normalizeValue(b);
}

export interface Tally {
  total: number;
  correct: number;
}

/** Confidence bands mirror the §5 review bands. */
export interface ConfidenceBucket {
  band: "manual (<0.80)" | "highlight (0.80–0.94)" | "auto (≥0.95)";
  n: number;
  correct: number;
}

export interface ItemScore {
  /** OCR items that matched a ground-truth item by name AND amount. */
  matched: number;
  expected: number;
  extracted: number;
}

export interface PageScore {
  entriesExpected: number;
  entriesExtracted: number;
  /** Entries paired by lineNumber. */
  entriesMatched: number;
  scalar: Record<ScalarKey, Tally>;
  services: ItemScore;
  meds: ItemScore;
  buckets: ConfidenceBucket[];
}

function emptyScalar(): Record<ScalarKey, Tally> {
  return Object.fromEntries(SCALAR_KEYS.map((k) => [k, { total: 0, correct: 0 }])) as Record<
    ScalarKey,
    Tally
  >;
}

function bandOf(confidence: number): ConfidenceBucket["band"] {
  if (confidence >= 0.95) return "auto (≥0.95)";
  if (confidence >= 0.8) return "highlight (0.80–0.94)";
  return "manual (<0.80)";
}

function scoreItems(
  extracted: OcrEntry["services"],
  expected: GroundTruthEntry["services"]
): ItemScore {
  const expRemaining = expected.map((item) => ({ ...item, used: false }));
  let matched = 0;
  for (const item of extracted) {
    const hit = expRemaining.find(
      (exp) => !exp.used && valuesMatch(item.name.value, exp.name) && valuesMatch(item.amount.value, exp.amount)
    );
    if (hit) {
      hit.used = true;
      matched++;
    }
  }
  return { matched, expected: expected.length, extracted: extracted.length };
}

export function scorePage(extraction: OcrPageExtraction, truth: GroundTruthPage): PageScore {
  const scalar = emptyScalar();
  const buckets: Record<ConfidenceBucket["band"], ConfidenceBucket> = {
    "manual (<0.80)": { band: "manual (<0.80)", n: 0, correct: 0 },
    "highlight (0.80–0.94)": { band: "highlight (0.80–0.94)", n: 0, correct: 0 },
    "auto (≥0.95)": { band: "auto (≥0.95)", n: 0, correct: 0 },
  };
  const services: ItemScore = { matched: 0, expected: 0, extracted: 0 };
  const meds: ItemScore = { matched: 0, expected: 0, extracted: 0 };

  const truthByLine = new Map(truth.entries.map((entry) => [entry.lineNumber, entry]));
  let entriesMatched = 0;

  for (const ocr of extraction.entries) {
    const gt = truthByLine.get(ocr.lineNumber);
    if (!gt) continue;
    entriesMatched++;

    for (const key of SCALAR_KEYS) {
      const field = ocr[key];
      const correct = valuesMatch(field.value, gt[key]);
      scalar[key].total++;
      if (correct) scalar[key].correct++;
      const bucket = buckets[bandOf(field.confidence)];
      bucket.n++;
      if (correct) bucket.correct++;
    }

    for (const [ocrItems, gtItems, acc] of [
      [ocr.services, gt.services, services],
      [ocr.meds, gt.meds, meds],
    ] as const) {
      const s = scoreItems(ocrItems, gtItems);
      acc.matched += s.matched;
      acc.expected += s.expected;
      acc.extracted += s.extracted;
    }
  }

  return {
    entriesExpected: truth.entries.length,
    entriesExtracted: extraction.entries.length,
    entriesMatched,
    scalar,
    services,
    meds,
    buckets: Object.values(buckets),
  };
}

/** Sum page scores into one report-level score. */
export function aggregate(pages: PageScore[]): PageScore {
  const total: PageScore = {
    entriesExpected: 0,
    entriesExtracted: 0,
    entriesMatched: 0,
    scalar: emptyScalar(),
    services: { matched: 0, expected: 0, extracted: 0 },
    meds: { matched: 0, expected: 0, extracted: 0 },
    buckets: [
      { band: "manual (<0.80)", n: 0, correct: 0 },
      { band: "highlight (0.80–0.94)", n: 0, correct: 0 },
      { band: "auto (≥0.95)", n: 0, correct: 0 },
    ],
  };
  for (const page of pages) {
    total.entriesExpected += page.entriesExpected;
    total.entriesExtracted += page.entriesExtracted;
    total.entriesMatched += page.entriesMatched;
    for (const key of SCALAR_KEYS) {
      total.scalar[key].total += page.scalar[key].total;
      total.scalar[key].correct += page.scalar[key].correct;
    }
    for (const which of ["services", "meds"] as const) {
      total[which].matched += page[which].matched;
      total[which].expected += page[which].expected;
      total[which].extracted += page[which].extracted;
    }
    for (const bucket of page.buckets) {
      const target = total.buckets.find((b) => b.band === bucket.band)!;
      target.n += bucket.n;
      target.correct += bucket.correct;
    }
  }
  return total;
}
