# Fermosa AI Platform — Project Report (Phase 5 complete)

**Date:** 2026-07-14 · **Target version:** v0.8.0-pre-ocr · **Branch:** `feature/crm-browser-connector` · **Prepared for:** senior developer review

---

## 1. Executive summary

The Fermosa AI Platform audits skin-care-clinic operations: branch staff upload paper
logbook photos, the platform OCRs them, retrieves the matching facts from the clinic's
existing CRM (read-only), compares the two, and produces reviewable audit findings. The
CRM stays the only source of truth — the platform stores immutable audit evidence, never
a mirror.

**Phase 5 ("Pre-OCR Completion") is done.** It maximized progress on everything that does
NOT depend on the still-missing OCR dataset:

- **M0044 — Live CRM validation:** the Playwright connector was verified against
  production (login, read-only session reuse, search with correct found/not-found/
  ambiguous semantics, full schema-valid record retrieval). A live-only login/redirect
  timing bug was found and fixed. Invoice-detail retrieval remains deferred (no capture).
- **M0045 — CRM dataset generator:** read-only, resumable, idempotent extraction of CRM
  data to a reproducible on-disk dataset, behind the connector seam.
- **M0046 — Audit report generator:** reproducible HTML / PDF-ready HTML / JSON reports
  built only from stored evidence (no live CRM after a snapshot exists).
- **M0047 — Rule engine expansion:** 10 new deterministic rules; 5 requested rules were
  reused from existing ones and documented rather than duplicated.

**M0048 (OCR ground-truth tool) was deliberately deferred** to be designed against real
OCR output rather than assumptions.

**Verification:** full `pnpm release-check` (typecheck, lint, tests, production build)
green on the whole branch. Every milestone was independently task-reviewed and fixed; a
final whole-branch review (see §6) returned **READY-WITH-MINORS** with all invariants
confirmed.

## 2. What a reviewer should look at first

The three new subsystems are independent and small: `services/crm/dataset/`,
`services/report/`, `services/rules/rules-extended.ts`. Each sits behind an existing seam
and touches no frozen contract. The load-bearing guarantees to check are read-only CRM
access (§5.1), report reproducibility-from-evidence (§5.3), and rule determinism (§5.4).

## 3. Architecture (unchanged foundations)

Next.js 15 App Router + React 19 · TypeScript strict · Tailwind v4 + shadcn/ui ·
PostgreSQL via Prisma · Auth.js v5 · Zod at boundaries · Vitest · pnpm. Layering
`app/ → features/ → services/ → lib/`. Capability seams (strategy + factory) for AI, CRM,
storage, audit; contracts freeze on first implementation, changes need an ADR (36 ADRs).
Phase 5 introduced **no new architecture and no new ADR** — the report and dataset
subsystems are derived artifacts, the rule additions are additive.

## 4. Phase 5 commits (on `feature/crm-browser-connector`)

Pre-phase baseline committed first (the completed but uncommitted M0042/M0042A/M0043):
`a066a3b` (live cockpit + capture-verified selectors), `3f65489` (snapshot engine).
Then Phase 5:

| Milestone | Commits |
| --- | --- |
| M0044 live validation | `97fdec0` (evidence doc) |
| M0045 dataset generator | `93d040b` impl → `b032765` fixes → `f2f2e37` echo + doc |
| M0046 report generator | `8ff3491` impl → `4c7716b` doc |
| M0047 rule expansion | `a344554` impl → `ce9711d` fixes → `8d710ba` doc |

(CRLF-only churn on v0.6.1-era files was deliberately excluded from every commit.)

## 5. The new subsystems

### 5.1 CRM dataset generator (M0045) — `services/crm/dataset/`
Sweeps `getCRMConnector()` into `datasets/crm/<id>/{patient,treatments,invoice,activity-log,metadata}.json`
+ a `manifest.json`. **Read-only** (only `fetchPatientRecord`/`findPatients`). **Resumable
+ idempotent** (re-running skips patients whose metadata exists; backfills manifest
provenance). **Failure-isolated + loud** (any per-patient error — connector or filesystem
— is recorded in `manifest.failures`; the batch continues). Reproducible via a SHA-256
`snapshotHash` reusing the snapshot engine's `contentHash`. CLI: `pnpm dataset:crm`, which
announces the active connector at startup so a bare run never silently sweeps the live CRM.
9 tests.

### 5.2 Live CRM validation (M0044)
Documented in `docs/MILESTONES/M0044.md`: production login (+ the timing-race fix),
session reuse, announcement neutralization, all three search outcomes, and full-record
retrieval returning schema-valid data across profile/treatment/invoice/activity in one
~26s call. Selector map unchanged (still `crm-selectors/v1` — login verified, no live
break). Honest remaining unknowns: invoice-detail (blocked on a capture), per-field value
spot-checks, `performedBy.role` semantics.

### 5.3 Audit report generator (M0046) — `services/report/`
`buildReportModel` (pure) + `renderReportHtml` (pure, deterministic, self-contained) +
`getReport` (branch-scoped Prisma reads). Reports are **reproducible from stored evidence
only** — no live CRM in the path; no `Date.now()` in the renderers; byte-identical output
for the same input. HTML is **injection-safe** (every value escaped; a `<script>` test
confirms) with 10 fixed sections. Export route `?format=json|html` (read-only). 14 tests
(incl. Postgres integration asserting cross-branch `NotFoundError`).

### 5.4 Rule engine expansion (M0047) — `services/rules/rules-extended.ts`
10 new deterministic rules (invoice-after-treatment, invoice-without-treatment,
duplicate-invoice, duplicate-treatment, impossible-session-sequence,
impossible-package-progression, repeated-edits, suspicious-activity-frequency,
staff-mismatch, package-over-completion), all mapping to existing `FindingCategory`
values (no migration). 5 requested rules were **reused** from existing ones and
documented (treatment-without-invoice → `missing-invoice`; deleted/edited-treatment →
existing; invoice-balance-mismatch → `invoice`; branch-mismatch not implementable —
invoices carry no branch). Existing `rules.ts` byte-unchanged. The full 23-rule engine
evaluates 1000 entries in ~80 ms (budget 300 ms). 44 tests.

## 6. Verification & final review

- `pnpm release-check` green on the whole branch (typecheck, lint, all tests, production
  build).
- Every milestone independently task-reviewed (spec + code quality); fixes applied and
  re-verified where reviews found issues (M0045: runnable CLI, resumed-run provenance,
  failure isolation; M0047: deterministic date sort, real-engine registration test).
- **Final whole-branch review: READY-WITH-MINORS.** Confirmed phase-wide: CRM read-only,
  seams intact, no frozen contract weakened, reports reproducible, auth consistent, HTML
  injection-safe/deterministic, build-safe. No Critical or Important findings.

## 7. Known follow-ups (minor, non-blocking)

1. **Before enabling live dataset sweep modes:** `--mode branch --branch X` stamps every
   swept patient's metadata with branch X even though the query doesn't filter by branch
   (dormant with the mock; a tracked task exists to fix before the live sweep path is on).
2. Severity display order is duplicated in the report HTML and React component (should
   derive from `lib/findings` `SEVERITY_RANK`).
3. Report appendix provenance reflects the newest snapshot; timeline renders raw
   timestamps; a no-op `severityLabel()`; `rules-extended` re-declares small local helpers
   — all cosmetic/maintainability.

## 8. Product decision surfaced (not decided in-phase)

Branch Managers currently cannot reach `/reports` at all (`reports:view` +
`ROUTE_ACCESS` are Auditor/Super-Admin only, pre-existing). M0046 scopes BMs correctly at
the service layer (defense in depth, tested), but whether BMs should have UI access to
their own branch's reports is a roadmap decision left to the product owner.

## 9. Remaining blockers before a first fully automated audit

- **The 100-page OCR sample dataset** (the gating external input).
- **An Anthropic API key** for the OCR provider.
- **OCR prompt calibration** against ground truth.
- **A CRM invoice-detail capture** to enable payments parsing (`invoiceDetail` stays off).
- The live CRM service account is in `.env` today; a dedicated read-only audit account is
  recommended over a personal login before routine operation.

## 10. Branch / release state

All Phase 5 work is committed on `feature/crm-browser-connector` (latest `8d710ba`).
**Not pushed** (standing rule: push only when the owner asks). Recommended wrap-up:
tag `v0.8.0-pre-ocr` and branch `feature/ocr-integration` for the OCR phase — pending the
owner's go-ahead to push.

*This report contains no patient data and no credentials. CRM reference captures and
generated datasets are git-ignored, local-only.*
