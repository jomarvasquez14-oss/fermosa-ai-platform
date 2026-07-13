# OCR Evaluation — Calibration Report

> **Status: ⏸ AWAITING INPUTS** (Sprint 3.2 groundwork complete; measurements pending).
> This document becomes the accuracy record for the OCR pipeline. Numbers are only
> ever written here from real calibration runs — never estimated, never fabricated.
> Related: [OCR_ARCHITECTURE.md](OCR_ARCHITECTURE.md) ·
> [MILESTONES/M0031.md](MILESTONES/M0031.md)

## Gating inputs (both currently missing)

| Input                                                                                | Why                                                                                            | How to provide                                                                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Real logbook page photos** (3–10 to start; varied handwriting, lighting, branches) | Prompt v001's column layout is an assumption; accuracy cannot be measured without ground truth | Drop JPG/PNG/WEBP files into `ocr-samples/` at the repo root (gitignored — patient PII never enters the repository) |
| **`ANTHROPIC_API_KEY`**                                                              | Calibration runs real Claude Vision calls                                                      | Add to `.env` (gitignored), restart the dev server                                                                  |

## Methodology (rig is built and tested)

1. **Ground truth**: for each `ocr-samples/<name>.jpg`, a human transcription at
   `ocr-samples/expected/<name>.json` (template provided in that folder). Illegible
   values are `null` — the model is _rewarded_ for saying `unreadable`, not penalized.
2. **Execution**: the calibration runner drives the **AI Playground** (the sanctioned
   execution environment) via Playwright — one run per sample per prompt×model combo:
   `node run-calibration.mjs --model=claude-sonnet-5 --prompt=logbook-extraction/v001`
3. **Scoring**: per-field normalized comparison (case/whitespace/punctuation-
   insensitive; times compared loosely so "02:30 pm" ≈ "2:30 PM"). Verdicts:
   `pass` / `fail` (wrong value) / `missing` (model returned null for a legible value).
   Entry-count mismatches (missed or invented rows) are tracked separately.
4. **Iteration**: analyze failures → write `logbook-extraction/v002` (immutable, new
   file, CHANGELOG entry) → rerun the same samples → compare `_summary.json`s.
   Prompts are never edited in place (PROJECT_RULES 23).

## Metrics captured per prompt×model combination

Overall field accuracy · per-field accuracy (patient name, treatment, therapist,
time) · entry-count fidelity · average page confidence · confidence calibration
(confidence vs. correctness per band) · average cost per page · average latency.

## Prompt comparison

_Pending first runs. Will tabulate v001 vs v00N per model (`claude-sonnet-5`,
`claude-haiku-4-5`) with the metrics above._

## Accuracy report

_Pending first runs._

## Recommended prompt & model

_Pending — the recommendation must cite measured numbers._

## Known weaknesses

_Pending. Expected candidates to verify against real pages: therapist-initials
legibility, time-column ambiguity (12h without AM/PM), multi-line entries, table
lines mistaken for character strokes._

## Ready-for-production checklist

- [ ] ≥ N real samples evaluated across ≥ 2 branches' handwriting (N ≥ 10 recommended)
- [ ] Overall field accuracy ≥ agreed threshold on the recommended prompt (propose ≥ 90% before review-assisted correction)
- [ ] Patient-name accuracy specifically ≥ agreed threshold (it drives CRM matching)
- [ ] Confidence bands validated: high-confidence fields are actually accurate (≥ 98% at ≥ 0.95), so auto-accept is trustworthy
- [ ] Zero schema-validation failures across the sample set (or repair-pass plan confirmed)
- [ ] Average cost per page within budget (target set by ops)
- [ ] Recommended prompt version frozen + CHANGELOG complete
- [ ] PII sign-off for sending patient names to Anthropic (OCR_ARCHITECTURE §10) — **business/legal, still open**
