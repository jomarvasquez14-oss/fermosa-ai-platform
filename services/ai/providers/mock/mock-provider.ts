import { AppError } from "@/lib/errors";
import type { AIProvider } from "@/services/ai/ai-provider";
import {
  validateOcrExtraction,
  type ExtractedField,
  type OcrPageExtraction,
} from "@/services/ai/ocr-schema";
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
 * Mock AI provider (Sprint 3.0) — the first AIProvider implementation.
 *
 * Produces schema-conforming sample OCR output with NO external calls, so the
 * playground, tests, and the future OCR pipeline can be built and exercised
 * without API keys or spend. Deterministic: the same image bytes always yield
 * the same extraction (seeded by image size), which keeps tests stable.
 *
 * Models select behavior, mirroring how real model choice changes outcomes:
 *  - mock-clean      high-confidence, fully readable page
 *  - mock-messy      low-confidence fields + unreadable regions (review bands)
 *  - mock-malformed  schema-violating raw output (validation-error path)
 */

const FIRST = ["Maria", "Joyce", "Catherine", "Angela", "Kristine", "Gerald", "Stephanie", "Aljon"];
const LAST = ["Santos", "Reyes", "dela Cruz", "Garcia", "Torres", "Miranda", "Rosales", "Arellano"];
const SERVICES = [
  "Gluta Drip",
  "Diamond Peel",
  "RF Slimming",
  "Hydrafacial",
  "Carbon Laser",
  "Carbon Face",
  "Acne Facial",
  "Bronze Membership",
];
const MEDS = ["Acne Soap", "Antibac Toner", "Sunmist", "Age Defy", "Oatmeal Soap", "Clinda Cream"];
const STAFF = ["Mhalet", "Marvi", "Lyra", "Alcane", "Amy"];

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)] as T;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildExtraction(seed: number, messy: boolean): OcrPageExtraction {
  const random = rng(seed);
  const entryCount = 2 + Math.floor(random() * 4);
  const entries: OcrPageExtraction["entries"] = [];
  const unreadableRegions: OcrPageExtraction["unreadableRegions"] = [];

  for (let line = 1; line <= entryCount; line++) {
    const base = messy ? 0.55 : 0.9;
    const spread = messy ? 0.4 : 0.09;
    // Every leaf confidence is recorded so entryConfidence is the true min().
    const leaves: number[] = [];
    const field = (value: string | null): ExtractedField => {
      const confidence = round2(Math.min(1, base + random() * spread));
      leaves.push(confidence);
      return { value, confidence, unreadable: false };
    };

    const staffUnreadable = messy && random() < 0.25;
    if (staffUnreadable) {
      unreadableRegions.push({ lineNumber: line, reason: "smudged staff initials" });
    }
    let staff: ExtractedField;
    if (staffUnreadable) {
      leaves.push(0);
      staff = { value: null, confidence: 0, unreadable: true };
    } else {
      staff = field(pick(random, STAFF));
    }

    const hour = 9 + Math.floor(random() * 9);
    const minute = pick(random, ["00", "15", "30", "45"]);
    const timeIn = field(`${hour > 12 ? hour - 12 : hour}:${minute} ${hour >= 12 ? "PM" : "AM"}`);

    const services = Array.from({ length: 1 + Math.floor(random() * 3) }, () => ({
      name: field(pick(random, SERVICES)),
      amount: field(String(300 + Math.floor(random() * 17) * 100)),
    }));
    const meds = Array.from({ length: Math.floor(random() * 3) }, () => ({
      name: field(pick(random, MEDS)),
      amount: field(String(100 + Math.floor(random() * 4) * 50)),
    }));

    const paidByBank = random() < 0.35;
    const total = String(500 + Math.floor(random() * 30) * 100);

    entries.push({
      lineNumber: line,
      patientName: field(`${pick(random, LAST)}, ${pick(random, FIRST)}`),
      staff,
      timeIn,
      timeOut: field(null),
      sessionNo: field(pick(random, ["1st", "2nd", "3rd", "1/c", "6/c"])),
      services,
      meds,
      cash: field(paidByBank ? null : total),
      bank: field(paidByBank ? total : null),
      points: {
        bp: field(random() < 0.5 ? String(100 + Math.floor(random() * 20) * 50) : null),
        op: field(random() < 0.2 ? "500" : null),
        np: field(random() < 0.4 ? String(100 + Math.floor(random() * 20) * 50) : null),
      },
      boundingBox: null,
      entryConfidence: round2(Math.min(...leaves)),
    });
  }

  return {
    schemaVersion: 2,
    pageNumber: 1,
    pageType: "transaction",
    entries,
    unreadableRegions,
    pageConfidence:
      entries.length === 0 ? 1 : round2(Math.min(...entries.map((entry) => entry.entryConfidence))),
    notes: messy ? "Simulated poor capture: uneven lighting, smudged staff column." : null,
  };
}

/** Deliberately violates the schema: bad types, missing fields, out-of-range confidence. */
function buildMalformedRaw(seed: number): string {
  const random = rng(seed);
  return JSON.stringify({
    schemaVersion: 2,
    pageNumber: "one", // wrong type
    pageType: "transaction",
    entries: [
      {
        lineNumber: 1,
        patientName: { value: `${pick(random, LAST)}, ${pick(random, FIRST)}`, confidence: 1.7 }, // >1, missing unreadable
        services: pick(random, SERVICES), // should be an array of {name, amount}
        boundingBox: null,
        entryConfidence: 0.9,
      }, // staff / timeIn / meds / cash / bank / points all missing
    ],
    pageConfidence: 0.9,
    // unreadableRegions and notes missing
  });
}

function simulatedUsage(random: () => number, imageBytes: number, outputChars: number): AIUsage {
  // Rough vision-model heuristics; good enough to exercise cost displays.
  const inputTokens = 850 + Math.floor(imageBytes / 900) + Math.floor(random() * 120);
  const outputTokens = Math.ceil(outputChars / 4);
  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: Number(((inputTokens * 0.9 + outputTokens * 3.6) / 1_000_000).toFixed(6)),
  };
}

async function simulateLatency(random: () => number): Promise<number> {
  const ms = 350 + Math.floor(random() * 450);
  await new Promise((resolve) => setTimeout(resolve, ms));
  return ms;
}

export class MockAIProvider implements AIProvider {
  readonly id = "mock" as const;

  async extractLogbook(
    input: ExtractLogbookInput,
    _options?: AIRequestOptions
  ): Promise<ExtractLogbookResult> {
    const model = input.model ?? "mock-clean";
    if (!["mock-clean", "mock-messy", "mock-malformed"].includes(model)) {
      throw new AppError("AI_UNKNOWN_MODEL", `Mock provider has no model "${model}".`);
    }

    const requestedAt = new Date().toISOString();
    const seed = input.image.data.byteLength + model.length * 7919;
    const random = rng(seed ^ 0x5f3759df);

    const raw =
      model === "mock-malformed"
        ? buildMalformedRaw(seed)
        : JSON.stringify(buildExtraction(seed, model === "mock-messy"), null, 2);

    const latencyMs = await simulateLatency(random);
    const validation = validateOcrExtraction(raw);

    return {
      extraction: validation.extraction,
      rawResponse: raw,
      validation: { valid: validation.valid, issues: validation.issues },
      meta: {
        provider: this.id,
        model,
        promptVersion: input.promptVersion,
        requestedAt,
        latencyMs,
        usage: simulatedUsage(random, input.image.data.byteLength, raw.length),
      },
    };
  }

  async analyzeImage(image: LogbookImageInput): Promise<ImageAnalysis> {
    const random = rng(image.data.byteLength);
    return {
      description: "Simulated analysis: handwritten logbook page, ruled columns.",
      labels: ["document", "handwriting", "table"],
      confidence: round2(0.8 + random() * 0.15),
    };
  }

  async generateSummary(input: SummaryInput): Promise<SummaryResult> {
    return { summary: `Simulated summary of ${input.subject} (${input.content.length} chars).` };
  }
}
