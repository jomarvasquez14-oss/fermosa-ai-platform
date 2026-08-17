# OCR Architecture — Audit Module

> **Design document (Sprint 2B.0, ADR-026). Nothing here is implemented yet.**
> This is the blueprint Sprint 2B builds against; deviations require updating this
> document plus an ADR. Related: [DOMAIN_MODEL.md](DOMAIN_MODEL.md) ·
> [ARCHITECTURE.md](ARCHITECTURE.md) §11 · [AI_RULES.md](AI_RULES.md)

Design goals, in priority order: **provider independence** (swap OpenAI ⇄ Claude ⇄
Gemini ⇄ Azure by configuration), **accuracy with honest uncertainty** (never present a
guess as a fact), **cost visibility from day one**, **maintainability** (prompts and
thresholds evolve without code archaeology), and **replaceability** (every stage can be
re-run, improved, or swapped without touching submitted evidence).

## 1. Pipeline Overview

```
AuditSubmission (SUBMITTED)
        │  trigger: status poll / explicit "start processing" (§8 note on events)
        ▼
┌─ OCR ORCHESTRATION (AuditService step: OCR) ─────────────────────────────┐
│                                                                          │
│  for each LogbookImage (independent, parallelizable, retry-isolated):    │
│                                                                          │
│   1. IMAGE VALIDATION      stored? decodable? size sane? → skip+flag     │
│   2. PREPARE               fetch via StorageProvider, apply rotation     │
│   3. OCR REQUEST           prompt (versioned) + model + provider + image │
│   4. PROVIDER CALL         via AIProvider.extractLogbook (seam, §2)      │
│   5. PARSE + VALIDATE      Zod schema on raw output; repair pass (§7)    │
│   6. NORMALIZE             trim/case/time formats; provider-neutral      │
│   7. PERSIST               OcrResult (per image, per attempt) + usage    │
│                                                                          │
└──────────────────────────────┬───────────────────────────────────────────┘
                               ▼
        aggregate page results → submission status → OCR_REVIEW
                               ▼
        HUMAN REVIEW (Sprint 2C): accept / correct per field,
        driven by confidence bands (§5) → confirmed data
                               ▼
        CRM COMPARISON (Sprint 3) reads CONFIRMED data only —
        never raw OCR output
```

Two rules the pipeline never breaks:

- **Submitted evidence is read-only** (DOMAIN_MODEL §5.1). OCR writes only to its own
  entities (`OcrResult`, usage records) plus the denormalized
  `LogbookImage.ocrConfidence` of the _accepted_ result.
- **Downstream consumes confirmed data, not raw extractions.** CRM comparison and
  reports read the human-reviewed values; re-running OCR can therefore never silently
  change a conclusion someone already signed off on.

## 2. Provider Strategy

The existing `AIProvider` seam (ADR-015/017) already carries the right shape —
`extractLogbook(input): Promise<LogbookExtraction>` — and the factory
(`getAIProvider()`, `AI_PROVIDER` env) already selects among `openai-vision`,
`claude`, `gemini`, `azure-openai`. Sprint 2B refines the contract (allowed pre-freeze,
ADR-015) rather than inventing a new one:

- **Input** is provider-neutral: `{ image: { storageKey, mimeType, rotation },
promptVersion, options: { timeoutMs, correlationId } }`. Providers receive bytes from
  the orchestrator (fetched through `StorageProvider`) — they never touch storage
  themselves.
- **Output** is the §4 schema, produced _inside_ the provider adapter. Whether a
  provider supports native structured output (OpenAI/Azure JSON mode, Claude tool-use,
  Gemini response schema) is an adapter detail; the orchestrator sees only validated,
  schema-conforming results. Translation at the boundary, per PROJECT_RULES 20.
- **Selection is per-request-capable**: the factory default comes from env, but the
  orchestrator may pass an explicit provider — this is what enables a **fallback
  chain** (primary provider fails all retries → optionally one attempt on a configured
  secondary) and A/B evaluation (same image, two providers, compare).
- **A `mock` provider** (deterministic fixtures) ships first for tests and local dev
  without API keys — mirroring the CRM connector pattern. _Status: mock shipped in
  Sprint 3.0; **Claude adapter shipped in Sprint 3.1** (playground-only — models
  `claude-sonnet-5` / `claude-haiku-4-5`, prompt from the registry, schema-validated
  at the boundary, friendly error mapping, cost estimation from a price snapshot).
  OpenAI/Gemini/Azure remain unimplemented._
- **No SDK anywhere but the adapter**: model names, API error shapes, token counting —
  all confined to `services/ai/providers/<name>/`. Swapping providers is an env change;
  adding one is one adapter + one factory case.

## 3. Prompt Architecture

Prompts are **immutable, versioned artifacts**, not string literals:

```
services/ai/prompts/
└── logbook-extraction/
    ├── v001.md        # frozen the moment any OcrResult references it
    ├── v002.md        # created by copy + edit; never edit v001 again
    └── CHANGELOG.md   # one line per version: what changed and why
```

- **Version format**: monotonically increasing `v###` per prompt family. The family +
  version (e.g. `logbook-extraction/v002`) is recorded on every OCR request.
- **Immutability rule**: once referenced by a persisted result, a version file is
  frozen — improving a prompt means a new version. This is what makes historical
  results interpretable ("v001 always missed the therapist column" stays diagnosable)
  and enables re-running old images with new prompts for measurable comparison.
- **Recorded on every OCR request** (persisted with the `OcrResult` / usage record):

  | Field                                     | Why                                                    |
  | ----------------------------------------- | ------------------------------------------------------ |
  | `promptVersion`                           | Reproduce or explain any historical extraction         |
  | `model`                                   | Same prompt behaves differently across model updates   |
  | `provider`                                | Fallback chains mean provider ≠ configuration constant |
  | `requestedAt` / `completedAt`             | Latency derivation + incident forensics                |
  | `inputTokens` / `outputTokens` _(future)_ | Cost attribution (§9)                                  |
  | `estimatedCostUsd` _(future)_             | Budget alerts per branch/submission                    |
  | `latencyMs` _(future)_                    | Provider SLO comparison, timeout tuning                |

- Prompt content guidelines (binding when 2B writes v001): instruct extraction only —
  never inference of missing values; require the §4 JSON shape; require explicit
  `unreadable` marking over guessing; PII handling per §10.

## 4. OCR JSON Schema

> **Updated to schemaVersion 2 (M0059, ADR-040).** The v1 shape below
> (patient/treatment/therapist/time) was an assumption; confirmed against 189
> real logbook photos, the entry is now **"per-patient full"**: `patientName,
> staff, timeIn, timeOut, sessionNo, cash, bank` plus `services[]`/`meds[]`
> (each `{name, amount}`) and `points{bp,op,np}`, with a page-level `pageType`
> (`transaction | summary | mixed`). The canonical Zod is
> `services/ai/ocr-schema.ts`; the v1 example here is retained for history. The
> daily financial rollup is deferred to a later schemaVersion.

Per-image structured response (Zod-validated at the provider boundary). Every leaf
value uses one **field wrapper**, because review UX and partial extraction both hinge
on per-field metadata:

```jsonc
// ExtractedField<T> — the atom of the whole design
{
  "value": "Maria Santos", // T | null — null when unreadable/absent
  "confidence": 0.93, // 0–1, provider-reported, calibrated later (§5)
  "unreadable": false,
} // explicit "could not read" ≠ low confidence
```

```jsonc
// OcrPageExtraction — one LogbookImage
{
  "schemaVersion": 1, // evolve the schema without breaking old rows
  "pageNumber": 3, // from displayOrder — ties result to evidence
  "entries": [
    // one logbook line = one treatment record
    {
      "lineNumber": 1, // position on the page: review UI + dedup anchor
      "patientName": { "value": "Maria Santos", "confidence": 0.93, "unreadable": false },
      "treatment": { "value": "Diamond Peel", "confidence": 0.97, "unreadable": false },
      "therapist": { "value": "J. Cruz", "confidence": 0.71, "unreadable": false },
      "time": { "value": "14:30", "confidence": 0.88, "unreadable": false },
      "boundingBox": null, // future: {x,y,w,h} normalized 0–1 — click-to-zoom review
      "entryConfidence": 0.87, // min of field confidences (weakest link, not average)
    },
  ],
  "unreadableRegions": [
    // page areas the model gave up on —
    { "lineNumber": 7, "reason": "ink smudge" }, // review UI must show the human
  ],
  "pageConfidence": 0.87, // min over entries; drives §5 routing
  "notes": "bottom two lines cropped", // free-text provider observations, never data
}
```

Why each field exists: **schemaVersion** — schema will evolve (bounding boxes, new
columns); old results must stay parseable. **pageNumber/lineNumber** — every datum
traces back to a physical place on evidence; reviewers and disputes need that anchor,
and (page, line) is the natural key for duplicate detection. **patientName /
treatment / therapist / time** — the four facts CRM comparison matches on (Sprint 4);
each wrapped so one smudged therapist name doesn't poison an otherwise-clean entry.
**boundingBox (future)** — click a field, see the handwriting; deferred because vision
LLMs return unreliable coordinates today. **entryConfidence / pageConfidence as
min()** — an entry is only as trustworthy as its weakest matched field; averaging
hides exactly the problems review exists to catch. **unreadableRegions** — "the model
saw something it couldn't read" is critical review information distinct from "the
model read something badly". **notes** — escape hatch for observations; explicitly
non-authoritative.

## 5. Confidence Strategy

Bands (recommended starting thresholds — stored in `SystemSetting`, not code, so
operations can tune without deploys):

| Band               | Range                                     | Handling                                                                                     |
| ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Auto-accept**    | ≥ 0.95                                    | Pre-filled as accepted in review; still visible, one tap to override                         |
| **Highlight**      | 0.80 – 0.94                               | Amber in the review table; reviewer must look, single click confirms                         |
| **Manual confirm** | < 0.80, or `unreadable`, or `value: null` | Red; blocks confirmation until explicitly resolved (typed correction or "illegible" verdict) |

Design positions:

- **Nothing bypasses human review in v1.** "Auto-accept" means _pre-confirmed default_,
  not _invisible_. Only after calibration data exists (see below) should truly
  skipping review be considered — and that's a future ADR.
- **LLM self-reported confidence is not calibrated.** Treat it as ordinal (higher =
  probably better), not probabilistic. Because every review stores the human verdict
  next to the model confidence, we accumulate a calibration set for free: after ~1–2k
  reviewed fields, plot accuracy-per-confidence-bucket and move the thresholds to hit
  target review effort vs. error rates. This feedback loop is the main reason
  corrections are persisted on `OcrResult` rather than overwriting values.
- **Confidence is per-field, aggregated by min()** (§4). Thresholds apply per field for
  highlighting and per entry for routing.

## 6. Multi-page Strategy

- **One image = one OCR request = one `OcrResult`.** Per-image isolation gives
  parallelism, page-level retry, and per-page cost attribution. No multi-image
  prompts in v1 (cost and context-confusion outweigh cross-page benefits).
- **Page identity** comes from `displayOrder` (frozen at submit); the extraction's
  `pageNumber` is stamped by the orchestrator, never trusted from the model.
- **Mixed orientations**: the stored `rotation` metadata (set by branch staff in 2A)
  is applied to the pixels during PREPARE, so providers always receive upright pages.
  If extraction confidence is pathologically low, one retry with auto-rotation
  detection (try 90/180/270) is permitted before failing — recorded as a distinct
  attempt.
- **Missing pages** cannot be detected structurally (logbooks have no page numbers we
  can trust). Heuristics — time-sequence gaps across pages, entry counts far below
  branch norms — produce **review flags**, never hard failures. The reviewer decides.
- **Duplicate pages**: post-OCR heuristic — two pages whose entry sets are
  near-identical (same patients+times) are flagged as suspected duplicates for the
  reviewer. The 2A upload dedup (name+size) already catches the trivial case.

## 7. Error Recovery

| Failure                                   | Handling                                                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider timeout / 5xx / rate limit       | Retry with exponential backoff + jitter, **max 3 attempts** per image; each attempt is a new `OcrResult` row (attempt counter — the model already supports this, DOMAIN_MODEL §3)                                                   |
| Malformed / non-schema JSON               | One **repair pass**: re-prompt with the validation errors and the original output ("return corrected JSON only"). Repair fails → attempt FAILED, normal retry path. Never hand-patch JSON in code                                   |
| Unreadable handwriting                    | **Not an error.** Fields come back `unreadable: true` / null values and flow to manual-confirm review (§5). An OCR run that reads 3 of 40 lines is a _successful run with poor yield_                                               |
| Partial extraction (some entries missing) | SUCCEEDED with what was read + `unreadableRegions` + low page confidence → review. Reviewer can trigger a manual re-run                                                                                                             |
| One image exhausts retries                | Its `OcrResult` is FAILED; the submission returns to `SUBMITTED` with the failure recorded (DOMAIN_MODEL §5.1 failure rule) and surfaces for manual re-trigger. Other pages' completed results are kept — work is never thrown away |
| Provider outage (systemic)                | Optional configured fallback provider gets one pass (§2); otherwise the submission waits in `SUBMITTED` — nothing is lost, nothing is guessed                                                                                       |

Retry policy notes: retries always reuse the same prompt version (comparability);
backoff parameters live in config; every attempt (including repairs) is recorded in
usage tracking — failed calls cost money too.

## 8. Orchestration & Trigger (design note for 2B)

OCR runs are **asynchronous relative to the submit action** — a submission with 20
images cannot process inside one request. 2B's minimal viable orchestration: the
`AuditService.executeStep(OCR)` implementation processes images with bounded
concurrency (2–4), triggered by an explicit "start/re-run processing" action and/or a
poll over `SUBMITTED` submissions. **Do not build queue infrastructure yet** — but do
route all triggering through `AuditService` so a real job runner can replace the
scheduler later without touching callers. The in-process `ocr.started`/`ocr.completed`
events remain notifications only (ADR-018): recovery derives from database state
(statuses + attempt counts), never from having heard an event.

## 9. Cost Architecture

Every provider call — success, repair, retry, or failure — produces one usage record.
Future entity (documented now, persisted when 2B lands, ADR-019 pattern):

```
AiUsageRecord
├─ id, createdAt
├─ operation        "ocr.extract" (later: "summary.generate", …)
├─ submissionId / imageId / ocrResultId     — full attribution chain
├─ provider, model, promptVersion            — the §3 trio
├─ inputTokens, outputTokens                 — provider-reported (estimated if absent)
├─ estimatedCostUsd                          — tokens × price table (versioned config,
│                                              prices change; never hardcoded)
└─ latencyMs, success                        — SLO + failure-cost visibility
```

Written by a **usage-recording decorator around the provider boundary** in
`services/ai/` — callers can't forget it, adapters can't skip it. Answers the
questions that matter later: cost per submission / per branch / per month, cost per
_successfully extracted entry_ by provider+model+prompt (the real efficiency metric —
what A/B decisions use), and spend-rate alerts. Aggregation dashboards are M4+; the
raw records must exist from the first call ever made, because cost history cannot be
backfilled.

## 10. Cross-cutting Constraints

- **PII**: logbook pages contain patient names. Provider adapters must use
  API tiers with no-training/no-retention guarantees (all four candidates offer
  them); which tier/DPA applies is verified per provider before its adapter ships.
  Raw page images never appear in logs or usage records — keys and IDs only.
- **Determinism knobs**: temperature 0 (or provider minimum) for extraction; recorded
  implicitly by prompt version (options are part of the prompt artifact's frontmatter).
- **Everything tunable lives in config**: thresholds (`SystemSetting`), retry/backoff,
  concurrency, price tables, fallback chain — code changes should mean logic changes.

## 11. Risks Before Sprint 2B

1. **~~The logbook page schema is still assumed, not confirmed~~ — RESOLVED
   (M0059, 2026-07-15).** 189 real branch logbook photos landed in
   `ocr-samples/branches/`; the schema is now confirmed and evolved to
   "per-patient full" (schemaVersion 2, ADR-040) with prompt `v002`. _Known
   upcoming change (CRM owner notes, 2026-07-13): logbooks do not carry patient
   IDs today, but the CRM developer will add them — when that happens the schema
   gains a `patientId` field and CRM lookup becomes exact instead of name-based
   (which also fixes the M0057 finding that name search returns 100+ candidates)._
2. **Confidence calibration is unknown** until real reviews accumulate; thresholds in
   §5 are educated defaults. Mitigated by SystemSetting-backed thresholds and persisted
   review verdicts.
3. **PII/data-processing sign-off** (which provider tier is contractually acceptable
   for patient names) is a business/legal decision — needed before the first real API
   call, not before 2B's mock-driven development.
4. **Async processing pressure**: §8's minimal orchestration is deliberate scope
   control; if submission volumes are high at launch, a proper job runner moves up the
   roadmap.
5. **Cost ceiling unvalidated**: ~20 images/submission × vision-model pricing needs a
   back-of-envelope check against real page sizes once samples exist; §9 gives the
   instrumentation, not the budget.
6. **Handwriting quality floor**: if real pages OCR below a usable yield on all four
   providers, the mitigation is process-side (capture guidelines, §6 flags), and 2C's
   review UI carries more weight — design anticipates this, but the yield number is
   unknowable until samples exist.
