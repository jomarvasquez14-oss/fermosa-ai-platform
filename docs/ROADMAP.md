# Roadmap

> Fermosa AI Platform — delivery plan by milestone.
> Dates are intentionally omitted until scheduling is agreed; sequence and scope are the commitment.
> Related: [PRODUCT.md](PRODUCT.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

## Summary

| Milestone        | Theme                                               | Status                       |
| ---------------- | --------------------------------------------------- | ---------------------------- |
| **M1**           | Platform foundation                                 | ✅ **Complete** (2026-07-12) |
| **M1.1**         | Architecture refinement (seams, events, AI rules)   | ✅ **Complete** (2026-07-12) |
| **M2 / 2A.1**    | Audit: upload interface (UI only)                   | ✅ **Complete** (2026-07-13) |
| **M2 / 2A.1.5**  | Audit: domain model review (no new functionality)   | ✅ **Complete** (2026-07-13) |
| **M2 / 2A.2**    | Audit: submission persistence (first real data)     | ✅ **Complete** (2026-07-13) |
| **M2 / 2B.0**    | Audit: OCR architecture design (no implementation)  | ✅ **Complete** (2026-07-13) |
| **M2 / 2B.1**    | CRM Discovery architecture (no implementation)      | ✅ **Complete** (2026-07-13) |
| **M3 / 3.0**     | AI Playground (mock provider, dev tooling)          | ✅ **Complete** (2026-07-13) |
| **M3 / 3.1**     | Claude vision provider (playground-only)            | ✅ **Complete** (2026-07-13) |
| **M3 / 3.2**     | OCR calibration (rig ready — awaiting samples/key)  | ⏸ **Blocked on inputs**      |
| **M3 / 3.3**     | OCR review interface (mock data)                    | ✅ **Complete** (2026-07-13) |
| **M3 / 3.4**     | Mock CRM connector + /dev/crm tooling               | ✅ **Complete** (2026-07-13) |
| **M3 / 3.5**     | Audit findings engine (canonical output, mock UI)   | ✅ **Complete** (2026-07-14) |
| **M3 / 3.6**     | Audit orchestrator (workflow layer, mock executors) | ✅ **Complete** (2026-07-14) |
| **M3 / 3.7**     | Rule engine (deterministic, findings out)           | ✅ **Complete** (2026-07-14) |
| **M3 / 3.9**     | Browser automation framework (mock driver only)     | ✅ **Complete** (2026-07-14) |
| **v0.6.1 / 4.0** | Engineering excellence (CI, telemetry, DX, reviews) | ✅ **Complete** (2026-07-14) |
| **M0041 / 4.1**  | CRM browser connector (Playwright; live-gated)      | ✅ **Complete** (2026-07-14) |
| **M0042 / 4.2**  | Live CRM validation + `/dev/browser` cockpit        | ✅ **Cockpit complete** (2026-07-14) |
| **M0043 / 4.3**  | Audit evidence snapshot engine                      | ✅ **Complete** (2026-07-14) |
| **M0042A / 4.2a**| Connector validated vs real CRM captures            | ✅ **Complete** (2026-07-14) |
| **M0044 / 4.4**  | Live CRM validation vs production (read path)       | ✅ **Validated** (2026-07-14; invoice-detail deferred) |
| **M0045 / 4.5**  | CRM dataset generator (read-only, resumable)        | ✅ **Complete** (2026-07-14) |
| **M0046 / 4.6**  | Audit report generator (HTML/PDF/JSON from evidence)| ✅ **Complete** (2026-07-14) |
| **M0047 / 4.7**  | Rule engine expansion (10 new deterministic rules)  | ✅ **Complete** (2026-07-14) |
| **M0049 / 6.1**  | Complete live CRM validation (full checklist)       | ✅ **Complete** (2026-07-14; 4 live-only defects fixed; invoice-detail still gated) |
| **M0050 / 6.2**  | Production CRM dataset builder (sweep modes, ADR-037)| ✅ **Complete** (2026-07-14; enumeration + derived branch/date, snapshot seal, verify) |
| **M0051 / 6.3**  | Pilot audit dataset (reproducible audit packages)   | ✅ **Complete** (2026-07-14; per-file + package hashes, self-verifying) |
| **M0052 / 6.4**  | Rule engine expansion II (7 new rules, 30 total)    | ✅ **Complete** (2026-07-14; deletions/cancellations/billing/density/cross-branch; <300ms/1000) |
| **M0053 / 6.5**  | Audit dashboards (auditor / branch / admin)         | ✅ **Complete** (2026-07-14; real-data aggregation, dependency-free charts) |
| **M0054 / 6.6**  | Scheduled audit pipeline (ADR-038; OCR wired-but-off)| ✅ **Complete** (2026-07-14; cadence + PipelineRun, composes existing services) |
| **M0055 / 6.7**  | Operational analytics (over stored snapshots)       | ✅ **Complete** (2026-07-14; branches/revenue/staff/packages, never live CRM) |
| **M0056 / 6.8**  | CRM connector production hardening (invoice detail live)| ✅ **Complete** (2026-07-14; invoiceDetail ON via embedded data-details, payments parsed, USER roles resolved, ADR-039) |
| **M0057**        | In-app browser UI verification (errata + method)    | ✅ **Complete** (2026-07-15; login proven working, visibility-throttle root-caused, dashboards/reports render real data) |
| **M0058**        | Activity-log windowed-filter timeout fix            | ✅ **Complete** (2026-07-15; slow ~15s filtered query vs 10s action default — per-click timeout override, live-verified) |
| **M2**           | Audit module core                                   | Next                         |
| **M3**           | AI-assisted auditing                                | Planned                      |
| **M4**           | Reports & administration                            | Planned                      |
| **M5+**          | Adjacent modules (CRM, Inventory, Sales, Marketing) | Future                       |
| Continuous       | Hardening & operations                              | Ongoing                      |

---

## M1 — Platform Foundation ✅

Everything the other milestones stand on. Shipped:

- Next.js 15 / TypeScript-strict / Tailwind v4 / shadcn/ui project with pnpm, ESLint 9,
  Prettier, and a clean production build.
- Authentication (Auth.js v5, credentials, JWT) and three-role RBAC enforced in
  middleware, server guards, services, and UI.
- Responsive authenticated shell: sidebar, topbar, breadcrumbs, user menu, dark mode;
  placeholder pages for every sidebar destination; 404/401/403/500 error pages.
- Full Prisma schema (User, Role, Branch, AuditSession, LogbookUpload, SystemSetting)
  with idempotent seed; transport-based logging service; documentation suite.

**Carried-over follow-ups** (do before or at the start of M2):

- [ ] Provision PostgreSQL (local + shared dev), run `db:migrate` + `db:seed`, verify the
      full login path end-to-end.
- [ ] `git init`, initial commit, and CI (typecheck + lint + build on every push).
- [ ] Rotate `AUTH_SECRET`; replace seeded passwords anywhere non-local.

## M1.1 — Architecture Refinement ✅

Future-proofing pass before feature development continues (no user-facing changes):

- **Capability seams** (interfaces only, dependency inversion — ADR-015…017):
  `services/ai` (`AIProvider`: extractLogbook/analyzeImage/generateSummary),
  `services/crm` (`CRMConnector` Strategy: browser-automation | api | mock), and
  `services/audit` (`AuditService` step pipeline with first-class retry). Factories
  select by env config and throw `NotImplementedError` until implementations land.
- **Typed in-process event bus** (`lib/events`, ADR-018) with the audit lifecycle event
  catalog — no broker, no handlers yet.
- **Shared error taxonomy** (`lib/errors.ts`) and **validated server environment**
  (`lib/config/env.ts`, ADR-020).
- **Pruned empty feature stubs** — modules are created when work begins (ADR-019).
- **docs/AI_RULES.md** — binding rules for AI-assisted development.

Future module candidates acknowledged this milestone (beyond the M5+ list): Executive
Dashboard, HR, Accounting — all follow the same module playbook when scheduled.

## M2 — Audit Module Core

Goal: a Branch Manager can upload logbooks; an Auditor can run an audit session against
them; management sees real numbers on the dashboard.

**Sprint 2A.1 — Upload interface ✅** (2026-07-13, see
[MILESTONES/M002A1.md](MILESTONES/M002A1.md)): `/audit/new` behind the new
`audit:upload` permission; reusable upload kit (`components/upload/`) with drag-drop,
camera capture, per-file validation (10 MB / 20 images / JPG-PNG-HEIC), preview dialog
with zoom + visual rotation, reordering; Vitest test infrastructure (ADR-022; 25 tests).
Deliberately no persistence — `handleContinue()` is the 2A.2 seam. Side effects of the
sprint: local PostgreSQL provisioned, initial migration + seed applied, and the login
path verified end-to-end in a real browser (closes two M1 follow-ups; CI and secret
rotation remain).

**Sprint 2A.1.5 — Domain model review ✅** (2026-07-13, ADR-023): studied the real
branch workflow and re-founded the audit entities before persistence could freeze the
wrong model. `AuditSubmission` (branch + audit date) is the aggregate root owning
ordered `LogbookImage`s; formal state machines, aggregate boundaries, naming decisions,
glossary, and 2A.2 risks live in the new authoritative
[DOMAIN_MODEL.md](DOMAIN_MODEL.md). Schema migrated
(`20260712231752_audit_submission_domain_model`, old empty tables dropped); the
unimplemented `AuditService` contract and event catalog re-termed to match. No new
functionality.

**Sprint 2A.2 — Submission persistence ✅** (2026-07-13, ADR-024/025, see
[MILESTONES/M002A2.md](MILESTONES/M002A2.md)): the platform's first real business data.
`StorageProvider` seam with a local-filesystem backend; draft submissions that persist
on first save and reopen losslessly; per-image uploads with individual retry; service-
layer branch scoping and post-submit immutability (locking verified by integration
tests); `AuditTrailEntry` business-event log; authenticated image delivery; submission
list/editor/read-only views. Draft-persistence timing resolved (DOMAIN_MODEL §8.1).

**Sprint 2B.0 — OCR architecture design ✅** (2026-07-13, ADR-026): the binding OCR
blueprint in [OCR_ARCHITECTURE.md](OCR_ARCHITECTURE.md) — provider-independent pipeline
over the `AIProvider` seam, immutable versioned prompts, per-field
`{value, confidence, unreadable}` extraction schema, SystemSetting-backed confidence
bands (0.95 / 0.80), per-image retry + JSON-repair error recovery, and `AiUsageRecord`
cost tracking. No implementation. **Gating input for 2B: sample logbook pages**
(OCR_ARCHITECTURE §11.1).

**Sprint 2B.1 — CRM Discovery architecture ✅** (2026-07-13, ADR-027): the binding CRM
blueprint in [CRM_DISCOVERY.md](CRM_DISCOVERY.md), grounded in HTML exports of the
production CRM — navigation map, `NormalizedCrmPatientRecord` snapshot model,
three-method read-only `CRMConnector` contract shared by browser-automation and future
API implementations, session/retry/drift strategy, and outcome-based error model. No
implementation. **Gating inputs for Sprint 3: login-page capture, USER-column
semantics, sanctioned read-only service account** (CRM_DISCOVERY §8).

**Remaining M2 scope (2B+):**

- **Dashboard goes live** — replace placeholder stats with real aggregates via the
  service layer; real recent-activity feed (submission trail is already recorded).
- **Auditor review stages** and the submission lifecycle through `COMPLETED` (follows
  the OCR sprints).
- **Cloud storage backend** (S3/Azure/GCS/R2/Supabase) when a vendor is chosen — one
  class + one env var (ADR-024).

Out of scope for M2: OCR, AI analysis, exports.

## M3 — AI-Assisted Auditing

**Sprint 3.0 — AI Playground ✅** (2026-07-13, see
[MILESTONES/M0030.md](MILESTONES/M0030.md)): first implementation on the AI seam. The
canonical OCR Zod schema, the refined `extractLogbook` contract, the prompt-artifact
registry (`logbook-extraction/v001`, draft), and a deterministic **mock provider**
(clean / messy / malformed models) — all exercised through a Super-Admin-only
`/playground` module showing raw response, parsed JSON, validation issues, latency,
tokens, and estimated cost. No external AI calls. Real providers (3.x) implement the
already-exercised contract.

**Sprint 3.1 — Claude vision provider ✅** (2026-07-13, see
[MILESTONES/M0031.md](MILESTONES/M0031.md)): `ClaudeVisionProvider` behind the
unchanged `AIProvider` interface — versioned prompt from the registry, canonical-schema
validation at the boundary, friendly error mapping (auth/rate-limit/timeout/bad-image),
token + estimated-cost capture, `ANTHROPIC_API_KEY` via validated env with graceful
no-key failure. Playground-only: the audit workflow still makes zero AI calls. SDK
fully mocked in tests (suite: 63). First real run awaits logbook samples + an API key.

**Sprint 3.2 — OCR calibration ⏸** (rig complete, blocked on inputs): calibration
runner + ground-truth workflow + [OCR_EVALUATION.md](OCR_EVALUATION.md) skeleton with
the ready-for-production checklist. Awaiting real logbook samples (`ocr-samples/`,
gitignored) and `ANTHROPIC_API_KEY` — accuracy numbers are only ever measured, never
estimated.

**Sprint 3.3 — OCR review interface ✅** (2026-07-13, see
[MILESTONES/M0033.md](MILESTONES/M0033.md)): the reusable review kit
(`components/ocr-review/`) + `useOcrReview` hook + `/audit/[id]/review` route
(`audit:manage`). Per-field accept/edit/unreadable with band-colored highlighting
(§5 thresholds), pre-acceptance at ≥ 0.95, corrections preserved beside OCR originals,
confirm gated on full resolution, page-by-page navigation beside the original evidence.
Runs on labeled mock extractions; persistence of review verdicts ships with OCR
integration. Suite: 81 tests.

**Sprint 3.4 — Mock CRM connector ✅** (2026-07-13, see
[MILESTONES/M0034.md](MILESTONES/M0034.md)): the ADR-027 contract realized in code —
`findPatients`/`fetchPatientRecord` over the Zod-validated
`NormalizedCrmPatientRecord`, a `fixtures/v1` dataset covering all eight matching
scenarios (duplicates, missing invoice, deleted/edited treatments, …), typed
infrastructure-error simulation, and the Super-Admin `/dev/crm` inspector. The live
CRM is never touched; Sprint 4 matching develops entirely against this connector.
Suite: 96 tests.

**Sprint 3.5 — Audit findings engine ✅** (2026-07-14, ADR-028, see
[MILESTONES/M0035.md](MILESTONES/M0035.md)): `AuditFinding` persisted as the
platform's canonical output — 11 evidence-grounded categories, INFO→CRITICAL
severities, provenance, typed evidence references, and the OPEN → REVIEWED → RESOLVED
workflow with shared transition rules. Reusable findings kit + `/findings` route
(Auditor/SA) on labeled mock data. [VISION.md](VISION.md) created — v1.0 definition,
user journeys, dashboard KPIs, success measures. The rule engine now only has to
_emit findings_. Suite: 105 tests.

**Sprint 3.6 — Audit orchestrator ✅** (2026-07-14, ADR-029, see
[MILESTONES/M0036.md](MILESTONES/M0036.md)): the workflow layer.
`services/orchestrator/` realizes the `AuditService` seam — persisted
`AuditJob`/`AuditJobStage`, a validated 7-status state machine, pluggable stage
executors (mock; human review genuinely waits), §5.1 submission-status mapping through
to `COMPLETED`, lifecycle events, retry/cancel, and the `/audit/[id]/progress`
timeline UI. Real OCR/CRM/matching integrations become one-executor swaps. Suite: 114
tests.

**Sprint 3.7 — Rule engine ✅** (2026-07-14, ADR-030, see
[MILESTONES/M0037.md](MILESTONES/M0037.md)): `services/rules/` — thirteen
deterministic, individually-tested rules over confirmed OCR + normalized CRM,
emitting canonical FindingDrafts; weighted risk/submission/branch scoring; config as
data. `findingService` persistence (§5.5 workflow, idempotent per producer), and the
orchestrator's MATCHING stage became the first REAL executor — `/findings` now shows
persisted rule-engine output with a saved review workflow. Suite: 139 tests.

**Sprint 3.9 — Browser automation framework ✅** (2026-07-14, ADR-031, see
[MILESTONES/M0039.md](MILESTONES/M0039.md)): `services/browser/` — the complete
automation architecture behind a six-method `BrowserDriver` seam, with the scriptable
mock driver as the only implementation. Versioned selector registry with structural
fingerprints, seven page objects, session lifecycle with expiry auto-reconnect,
navigate/retry/recover, typed CRM error taxonomy, and the `/dev/browser` playground.
Real CRM automation later = one Playwright driver + confirmed selectors. Suite: 154
tests. **Sprint 3.8 (OCR integration) remains intentionally skipped until real logbook
samples arrive.**

**Version 0.6.1 — Engineering excellence ✅** (2026-07-14, ADR-032, see
[MILESTONES/M0040.md](MILESTONES/M0040.md)): GitHub Actions CI (Postgres service
container, test summary, fail-fast — the M1 carry-over closed), `lib/telemetry/`
(spans, correlation ids, error classification; orchestrator + rule-engine
instrumented), `pnpm verify`/`release-check` + [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md),
and three formal reviews: [PERFORMANCE.md](PERFORMANCE.md),
[SECURITY.md](SECURITY.md) (one missing page guard found and fixed), and the
architecture validation report (M0040 §4.0F). Suite: 160 tests.

**M0041 — CRM browser connector ✅** (2026-07-14, ADR-033, see
[MILESTONES/M0041.md](MILESTONES/M0041.md)): the first REAL `CRMConnector` —
Playwright Chromium behind the Sprint 3.9 `BrowserDriver` seam (Playwright confined to
`services/browser/drivers/playwright/`), selector map v1 rebuilt from the reference
captures with per-table header fingerprints and `neverInteract` lists, seven page
objects (patients, profile, treatment/invoice tabs, activity log), session manager
(one login per execution, idle re-verification, reconnect), and
`PlaywrightCRMConnector` under the unchanged `browser-automation` kind
(`CRM_CONNECTOR=playwright` alias; credentials via `CRM_URL`/`CRM_USERNAME`/
`CRM_PASSWORD`). Records are Zod-validated at the boundary; parsing failures are
`CRM_LAYOUT`, never silent. Suite: 211 tests + a real-Chromium smoke test. **Live
verification is gated on the read-only service account** (login capture + invoice-
detail trigger are the remaining selector gaps).

**M0042 — Live CRM validation ⏸ / validation cockpit ✅** (2026-07-14, ADR-034, see
[MILESTONES/M0042.md](MILESTONES/M0042.md)): the live phases (auth, navigation,
connector, parser, robustness) **did not run** — `.env` still has no
`CRM_URL`/`CRM_USERNAME`/`CRM_PASSWORD`, and the selector registry honestly stays at
v1 untouched. What shipped: `/dev/browser` grew the supervised validation cockpit
(credential-presence badges, connector health, patient search, open patient,
normalized-JSON preview — all through `getCRMConnector()`), so the moment credentials
exist, live validation is a supervised button-clicking session against the M0041
checklist.

**M0043 — Audit evidence snapshot engine ✅** (2026-07-14, ADR-035, see
[MILESTONES/M0043.md](MILESTONES/M0043.md)): `AuditEvidenceSnapshot` (one table,
linked only to `AuditSubmission`; no patient/treatment tables, ever) stores the full
`NormalizedCrmPatientRecord` as hash-sealed, append-only evidence with provenance
(connector kind, selector version, retrievedAt, window, format version).
`services/crm/snapshot/` implements create/load/validate/compare with loud
`EVIDENCE_INVALID`/`EVIDENCE_INTEGRITY` failures; `/dev/snapshot` is the capture &
comparison playground. The CRM remains the only source of truth — audits become
reproducible after it changes. Suite: 233 tests. Orchestrator wiring
(`CRM_RETRIEVAL` → `createSnapshot`) is deliberately deferred to OCR integration.

**M0042A — Connector validated vs real CRM captures ✅** (2026-07-14, ADR-036, see
[MILESTONES/M0042A.md](MILESTONES/M0042A.md)): the login capture landed (blind spot
closed — `input[name=email]`, no captcha) plus fresh dashboard/patients saves and the
CRM's `announcements.js`. A capture-replay harness (real Chromium driving the real
page objects against offline file:// captures, 27/27) caught and fixed three real
bugs: hidden bookkeeping inputs corrupting cell values, instant fingerprints racing
CSS-hidden-until-JS tables (fingerprints now wait), and select2-hidden native selects
in fingerprints. Announcement modals are now NEUTRALIZED client-side (their close
buttons POST mark-as-read — a write automation must never perform). v1 patched in
place; `invoiceDetail` stays off (detail view still uncaptured). Suite: 234 tests.

Goal: reduce manual review effort on uploaded logbooks.

- OCR / document-understanding pipeline over processed uploads (async jobs — likely the
  platform's first background-worker infrastructure).
- AI-generated audit findings and compliance flags, always reviewable and overridable by
  the human auditor; model outputs stored with provenance.
- Compliance-rate computation formalized (per PRODUCT.md glossary).

> Scope here is directional; M3 planning should revisit it after M2 learnings.

## M4 — Reports & Administration

- **Reports module**: compliance summaries, branch comparisons, period filters,
  CSV/PDF export.
- **Users module**: invitations, role assignment, branch assignment, deactivation.
- **Branches module**: full directory CRUD (status-driven deactivation, never deletion).
- **Settings module**: admin UI over the `SystemSetting` store.
- **SSO** (Microsoft Entra ID or Google Workspace) replaces credentials for production.

## M5+ — Adjacent Modules

CRM, Inventory, Sales, and Marketing follow the module playbook in
[DEVELOPMENT.md](DEVELOPMENT.md) ("Adding a New Module"). Each begins with its own
product definition appended to [PRODUCT.md](PRODUCT.md). No further commitments here
until the audit vertical is proven.

## Continuous — Hardening & Operations

Not milestone-gated; picked up as capacity allows, priority rises with usage:

- Test infrastructure: unit/component testing shipped in Sprint 2A.1 (Vitest + RTL,
  ADR-022). E2E remains open — adopt a Playwright suite before M2 mutations ship.
- External log/error sink (implement a `LogTransport` for Datadog/Sentry/Axiom).
- Rate limiting and login attempt throttling.
- Backup/restore and migration-rollback runbooks.
- Session strategy review: move JWT → database sessions if instant revocation becomes a
  requirement (see DECISIONS.md ADR-005).

## Change Control

The roadmap is owned by the project lead. Scope changes to the _current_ milestone
require an entry in [DECISIONS.md](DECISIONS.md); reordering _future_ milestones just
edits this file. Keep the summary table's status column current — it is the page people
actually read.
