# Roadmap

> Fermosa AI Platform — delivery plan by milestone.
> Dates are intentionally omitted until scheduling is agreed; sequence and scope are the commitment.
> Related: [PRODUCT.md](PRODUCT.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

## Summary

| Milestone  | Theme                                               | Status                       |
| ---------- | --------------------------------------------------- | ---------------------------- |
| **M1**     | Platform foundation                                 | ✅ **Complete** (2026-07-12) |
| **M1.1**   | Architecture refinement (seams, events, AI rules)   | ✅ **Complete** (2026-07-12) |
| **M2**     | Audit module core                                   | Next                         |
| **M3**     | AI-assisted auditing                                | Planned                      |
| **M4**     | Reports & administration                            | Planned                      |
| **M5+**    | Adjacent modules (CRM, Inventory, Sales, Marketing) | Future                       |
| Continuous | Hardening & operations                              | Ongoing                      |

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

- **Logbook upload intake** — file upload to object storage (S3/Azure Blob), `storageKey`
  persistence, upload listing per branch, status lifecycle
  (`PENDING → PROCESSING → PROCESSED/FAILED`).
- **Audit sessions** — create/schedule sessions, assign auditor, attach uploads, record
  notes, drive the `PENDING → IN_PROGRESS → COMPLETED/CANCELLED` lifecycle.
- **Branch scoping in anger** — Branch Managers see only their branch's uploads and
  sessions (service-layer enforcement, already stubbed in `branchService`).
- **Dashboard goes live** — replace placeholder stats with real aggregates via the
  service layer; real recent-activity feed.
- **Foundational additions**: `AuditLog` table (who did what, when), object-storage
  service abstraction, decision on upload-then-attach vs. session-first flow (blocks
  upload UX design).

Out of scope for M2: OCR, AI analysis, exports.

## M3 — AI-Assisted Auditing

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

- Test infrastructure (unit + e2e) — the codebase currently has no tests; this becomes
  blocking before M2 mutations ship.
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
