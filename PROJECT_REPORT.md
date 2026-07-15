# Fermosa AI Platform — Project Report (Phase 6 complete)

**Date:** 2026-07-14 · **Target version:** v0.9.0-pre-ocr · **Branch:** `feature/crm-browser-connector` · **Prepared for:** senior developer review

---

## 1. Executive summary

The Fermosa AI Platform audits skin-care-clinic operations: branch staff upload paper
logbook photos, the platform OCRs them, retrieves the matching facts from the clinic's
existing CRM (read-only), compares the two, and produces reviewable audit findings. The
CRM stays the only source of truth — the platform stores immutable audit evidence, never
a mirror.

**Phase 6 ("Pre-OCR v0.9") is done.** It maximized everything that does NOT depend on the
still-missing OCR dataset, building on the Phase 5 (v0.8) foundation:

- **M0049 — Complete live CRM validation.** Ran the full checklist against production via
  a new read-only probe (`pnpm validate:crm`); found, fixed, and re-verified **four
  live-only defects** (health-check auth ordering, live empty-table phrasing, the
  JS-collapsed activity Filters panel, and phantom empty-activity parsing). Invoice-detail
  stays disabled with live evidence (no row-level trigger exists). Also hardened
  `vitest.config` so a nested worktree's `node_modules` can't poison the suite.
- **M0050 — Production CRM dataset builder.** Added an **optional `listPatients`
  enumeration** to the connector seam (ADR-037) and real sweep modes
  (patient / branch / date-range / entire-clinic) with **derived** branch/date filtering, a
  `snapshot.json` reproducibility seal, `--verify` hash checks, progress+ETA, and duplicate
  detection. Supersedes M0045's null-stamp stopgap.
- **M0051 — Pilot audit dataset.** `services/audit-package/` composes the read-only
  evidence for a branch/audit-date into a **reproducible, self-verifying** on-disk package
  (`pnpm audit:package`): per-file + package hashes, an auto-run verification report.
- **M0052 — Rule engine expansion II.** Seven new deterministic rules (repeated
  cancellations/deletions/invoice-corrections, large billing adjustments, activity-density
  bursts, cross-branch inconsistencies, invoice chronology) — **30 rules total**, five
  requested categories mapped to existing rules rather than duplicated, <300 ms / 1000
  records.
- **M0053 — Audit dashboards.** Role-scoped auditor / branch / admin views from **real
  data only**, with dependency-free (SVG/CSS) charts; the old placeholder mock data was
  deleted.
- **M0054 — Scheduled audit pipeline.** A cadence layer (ADR-038) over the existing
  orchestration: `AuditSchedule` + `PipelineRun`, a **stage list that is data** with **OCR
  present-but-disabled**, composing the real rule/finding/report services
  (`pnpm audit:pipeline`).
- **M0055 — Operational analytics.** Trends over **stored snapshots only** (never the live
  CRM): branches, treatment frequency, revenue, package completion, staff activity,
  edit-activity, branch comparison — `/analytics`, role-gated.

**Verification:** full `pnpm release-check` (typecheck, lint, tests, production build) green
on the whole branch (357 tests). The scheduled pipeline was additionally exercised
**end-to-end against the real database** (all seven stages, OCR skipped, a `PipelineRun`
persisted).

## 2. What a reviewer should look at first

Seven independent subsystems, each behind an existing seam and touching no frozen contract:
`services/crm/dataset/` (now sweep-capable), `services/audit-package/`, `services/rules/
rules-extended-2.ts`, `services/dashboard/`, `services/pipeline/`, `services/analytics/`,
plus the connector-seam `listPatients` addition. The load-bearing guarantees to check are:
CRM stays read-only phase-wide, reproducibility seals hold (dataset + audit package),
rules stay deterministic and fast, dashboards/analytics read real data only, and the
pipeline's OCR seam is genuinely wired-but-off.

## 3. Architecture (unchanged foundations)

Next.js 15 App Router + React 19 · TypeScript strict · Tailwind v4 + shadcn/ui ·
PostgreSQL via Prisma · Auth.js v5 · Zod at boundaries · Vitest · pnpm. Layering
`app/ → features/ → services/ → lib/`. Capability seams (strategy + factory) for AI, CRM,
storage, audit; contracts freeze on first implementation, changes need an ADR.
**Phase 6 added two ADRs** — ADR-037 (additive `listPatients` enumeration) and ADR-038
(scheduled pipeline + schedule/run models) — and **one migration** (`AuditSchedule`,
`PipelineRun`). Everything else is additive: new services behind existing seams, additive
rule-engine config, no weakened contract, `NormalizedCrmPatientRecord` (ADR-027) untouched.

## 4. Phase 6 commits (on `feature/crm-browser-connector`)

| Milestone | Commit |
| --- | --- |
| M0049 live validation | `3271d19` (+ `1ff8b08` cherry-picked dataset-branch fix) |
| M0050 dataset builder | `e845b42` |
| M0051 audit packages | `dd42c47` |
| M0052 rules II | `6e1d4d1` |
| M0053 dashboards | `1410899` |
| M0054 pipeline | `2f605f6` |
| M0055 analytics | `5b28bfc` |

(CRLF-only churn on v0.6.1-era files was deliberately excluded from every commit.)

## 5. Verification & review

- `pnpm release-check` green on the whole branch (typecheck, lint, all tests, production
  build), re-run after every milestone.
- New tests this phase: dataset builder (24), CLI parsers (×3), audit package (13), rules
  (18), dashboards (6), pipeline (13), analytics (5) — plus the M0049 browser-layer tests.
- Live/real-system checks: M0049 live CRM probe (13/13 after fixes); M0054 pipeline
  end-to-end against the real DB; M0050/M0051 CLIs smoke-tested in mock mode.
- **Not captured:** the authenticated dashboard/analytics visual render — the seeded
  sign-in did not submit through the in-app browser (the known server-action hydration
  flakiness from M0044, an environment limitation). Dashboard/analytics logic is
  unit-tested; both routes compile in the production build.

## 6. Known follow-ups (minor, non-blocking)

- The Playwright `listPatients` re-navigates per page (DataTable pagination is a UI
  control, not a trustworthy URL param), bounded by `maxEnumerationPages` — deep-page
  sweeps cost more; explicit id lists are preferred for large clinics (documented, ADR-037).
- Pre-OCR, the pipeline's RULES stage evaluates over an empty entry set (0 findings —
  correct) and SNAPSHOT/DATASET report state rather than doing work; the delivered value is
  the wiring and the OCR seam.
- Analytics staff-role granularity is limited to aesthetician/encoder/unknown by the
  normalized contract; branch revenue is clinic-wide (invoices carry no branch).

## 7. Remaining blockers before a first fully automated audit

- **The 100-page OCR sample dataset** (the gating external input).
- **An Anthropic API key** for the OCR provider.
- **OCR prompt calibration** against ground truth.
- **A CRM invoice-detail capture** to enable payments parsing (`invoiceDetail` stays off).
- A dedicated read-only audit CRM account is recommended over a personal login before
  routine operation.

## 8. Branch / release state

All Phase 6 work is committed on `feature/crm-browser-connector` (latest `5b28bfc`).
Recommended wrap-up: tag **`v0.9.0-pre-ocr`**. **Not pushed** — the standing rule is push
only when the owner asks.

*This report contains no patient data and no credentials. CRM reference captures,
generated datasets, and audit packages are git-ignored, local-only.*
