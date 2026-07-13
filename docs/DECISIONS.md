# Decisions (ADR Log)

> Architecture Decision Records for the Fermosa AI Platform.
> Append-only: new decisions get the next number; reversals get a _new_ ADR that marks the old one **Superseded**. Never rewrite history.
>
> Format: Status · Context · Decision · Consequences. Keep each record short enough to read in a minute.

| #                                                                                       | Decision                                                | Status   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------- |
| [ADR-001](#adr-001-modular-monolith)                                                    | Modular monolith over microservices                     | Accepted |
| [ADR-002](#adr-002-nextjs-app-router-as-full-stack-framework)                           | Next.js App Router as the full-stack framework          | Accepted |
| [ADR-003](#adr-003-feature-based-architecture-with-a-service-layer)                     | Feature-based architecture with a service layer         | Accepted |
| [ADR-004](#adr-004-authjs-v5-with-credentials-provider)                                 | Auth.js v5 with a Credentials provider (interim)        | Accepted |
| [ADR-005](#adr-005-jwt-sessions-over-database-sessions)                                 | JWT sessions over database sessions                     | Accepted |
| [ADR-006](#adr-006-split-auth-configuration-for-the-edge-runtime)                       | Split auth configuration for the Edge runtime           | Accepted |
| [ADR-007](#adr-007-permission-based-authorization-over-role-checks)                     | Permission-based authorization over role checks         | Accepted |
| [ADR-008](#adr-008-role-as-a-table-backed-by-a-closed-enum)                             | `Role` as a table backed by a closed enum               | Accepted |
| [ADR-009](#adr-009-cuid-primary-keys-and-snake_case-column-mapping)                     | cuid primary keys and snake_case column mapping         | Accepted |
| [ADR-010](#adr-010-restrictive-delete-rules-around-audit-records)                       | Restrictive delete rules around audit records           | Accepted |
| [ADR-011](#adr-011-transport-based-in-house-logger)                                     | Transport-based in-house logger (no vendor yet)         | Accepted |
| [ADR-012](#adr-012-tailwind-v4--shadcnui-with-token-only-styling)                       | Tailwind v4 + shadcn/ui with token-only styling         | Accepted |
| [ADR-013](#adr-013-client-side-app-shell-components)                                    | Client-side app-shell components                        | Accepted |
| [ADR-014](#adr-014-pnpm-with-explicit-build-script-approvals)                           | pnpm with explicit build-script approvals               | Accepted |
| [ADR-015](#adr-015-interface-first-capability-seams-dependency-inversion)               | Interface-first capability seams (dependency inversion) | Accepted |
| [ADR-016](#adr-016-crm-access-via-the-strategy-pattern)                                 | CRM access via the Strategy pattern                     | Accepted |
| [ADR-017](#adr-017-provider-independent-ai-layer)                                       | Provider-independent AI layer                           | Accepted |
| [ADR-018](#adr-018-typed-in-process-event-bus)                                          | Typed in-process event bus (no message broker)          | Accepted |
| [ADR-019](#adr-019-no-empty-feature-stubs--modules-are-created-on-demand)               | No empty feature stubs — modules are created on demand  | Accepted |
| [ADR-020](#adr-020-validated-lazy-server-environment)                                   | Validated, lazy server environment                      | Accepted |
| [ADR-021](#adr-021-client-only-ephemeral-upload-staging-sprint-2a1)                     | Client-only, ephemeral upload staging (Sprint 2A.1)     | Accepted |
| [ADR-022](#adr-022-vitest--react-testing-library-for-component-tests)                   | Vitest + React Testing Library for component tests      | Accepted |
| [ADR-023](#adr-023-auditsubmission-as-the-audit-aggregate-root)                         | AuditSubmission as the audit aggregate root             | Accepted |
| [ADR-024](#adr-024-storage-provider-abstraction-with-a-local-filesystem-backend)        | Storage provider abstraction (local backend first)      | Accepted |
| [ADR-025](#adr-025-draft-persistence-model-and-post-submit-immutability-enforcement)    | Draft persistence + post-submit immutability            | Accepted |
| [ADR-026](#adr-026-ocr-architecture--versioned-prompts-wrapped-fields-recorded-costs)   | OCR architecture (prompts, fields, cost records)        | Accepted |
| [ADR-027](#adr-027-crm-discovery--read-only-connector-over-a-normalized-snapshot-model) | CRM Discovery: read-only connector, snapshot model      | Accepted |

All records below dated **2026-07-12** (ADR-001…014: Milestone 1; ADR-015…020: Milestone 1.1) unless noted.

---

## ADR-001: Modular monolith

**Status:** Accepted

**Context:** The platform will grow to many modules (Audit, CRM, Inventory, …) over
years. Microservices offer isolation but demand infrastructure (service discovery,
distributed auth, multiple deploys) far beyond the team's current needs.

**Decision:** One Next.js application and one PostgreSQL database. Module isolation is
achieved structurally: import-isolated `features/`, a service layer owning data access.

**Consequences:** Single deploy target and trivial local setup. Isolation is enforced by
convention and review, not the compiler — [PROJECT_RULES.md](PROJECT_RULES.md) makes it
binding. Extraction of a hot module later means lifting its feature + service + schema
slice, not surgery.

## ADR-002: Next.js App Router as full-stack framework

**Status:** Accepted

**Context:** The stack was mandated: Next.js 15, TypeScript, Prisma, PostgreSQL. The open
choice was how much to lean on App Router primitives versus a separate API layer.

**Decision:** Use App Router end-to-end: Server Components for reads, server actions for
mutations, middleware for route protection, route handlers only where a real HTTP
endpoint is required (Auth.js handler today).

**Consequences:** No parallel REST layer to maintain; access control and rendering share
one session mechanism. Couples us to React Server Component semantics — the
serialization boundary bit us once already (see ADR-013).

## ADR-003: Feature-based architecture with a service layer

**Status:** Accepted

**Context:** Enterprise codebases rot when business logic smears across pages, API
routes, and components, and when every file can query the ORM directly.

**Decision:** Three binding layers: `app/` routes are thin (guard + compose);
`features/<module>` owns module UI/actions/schemas and never imports another feature;
`services/` is the only Prisma consumer and carries cross-cutting invariants (e.g.
branch scoping).

**Consequences:** Predictable placement for any new code; security-relevant query rules
live in exactly one layer. Costs some ceremony for trivial reads — accepted as the price
of the invariant.

## ADR-004: Auth.js v5 with Credentials provider

**Status:** Accepted _(interim by design)_

**Context:** V1 is an internal tool with admin-provisioned accounts; the organization's
IdP integration is not yet available. Auth.js v5 is the mandated library and is still in
beta — a known, accepted risk (it is the de-facto standard for Next.js 15).

**Decision:** Email + bcrypt-hashed password via the Credentials provider. Login is
Zod-validated on both client and server; non-`ACTIVE` users are rejected at `authorize`.

**Consequences:** Zero external dependencies to ship v1. Password handling burden
(hashing, future reset flows, throttling) is ours until SSO lands — SSO is an additive
provider change and is scheduled in [ROADMAP.md](ROADMAP.md) M4.

## ADR-005: JWT sessions over database sessions

**Status:** Accepted

**Context:** Auth.js offers JWT or database-backed sessions. Middleware runs on the Edge
runtime, where Prisma is unavailable, and route protection must not add a DB round-trip
to every request.

**Decision:** JWT strategy, 8-hour lifetime, with `id`, `role`, and `branchId` embedded
as claims.

**Consequences:** Authorization decisions are computable everywhere (middleware included)
without touching the database. Trade-offs accepted: revocation is by expiry only, and
role/branch changes take effect on next sign-in. If instant revocation becomes a
requirement, switch to database sessions and re-evaluate middleware checks.

## ADR-006: Split auth configuration for the Edge runtime

**Status:** Accepted

**Context:** `middleware.ts` bundles for the Edge runtime; importing the full auth setup
would drag Prisma and bcrypt into that bundle and fail.

**Decision:** `lib/auth/auth.config.ts` is edge-safe (callbacks, pages, session policy,
route authorization) and is all middleware imports. `lib/auth/index.ts` extends it with
the Credentials provider and is Node-only.

**Consequences:** Clean Edge bundle; the RBAC route map (`ROUTE_ACCESS`) also stays
edge-safe by duplicating role names as string constants instead of importing Prisma's
enum. The duplication is guarded by `isAppRole` and noted in both files.

## ADR-007: Permission-based authorization over role checks

**Status:** Accepted

**Context:** Scattering `if (role === "SUPER_ADMIN")` through pages makes adding a role
a codebase-wide hunt.

**Decision:** A capability matrix in `lib/auth/roles.ts` (`PERMISSIONS`,
`ROLE_PERMISSIONS`); pages guard with `requirePermission("reports:view")`. Route-prefix
enforcement (`ROUTE_ACCESS`) and nav visibility derive from the same file.

**Consequences:** Adding or reshaping a role is a one-file change. Discipline required:
new capabilities must be added to the matrix, not checked inline —
[PROJECT_RULES.md](PROJECT_RULES.md) rule 3.

## ADR-008: `Role` as a table backed by a closed enum

**Status:** Accepted

**Context:** The spec requires a `Role` model; code needs a closed, type-safe role set.
A bare string table gives flexibility but no compile-time guarantees; a bare enum gives
guarantees but no place for metadata.

**Decision:** Both: a `roles` table (description, timestamps, FK from users) whose `name`
column is the Prisma enum `RoleName`. TypeScript mirrors it as the `ROLES` const.

**Consequences:** Referential integrity and room for per-role metadata, while the closed
set the authorization code relies on is guaranteed by the database. New roles are a
schema migration — deliberate, not accidental.

## ADR-009: cuid primary keys and snake_case column mapping

**Status:** Accepted

**Decision:** All PKs are cuids (string). Tables/columns are `snake_case` via
`@@map`/`@map`; Prisma models stay idiomatic camelCase.

**Consequences:** IDs are URL-safe and non-enumerable (no sequential probing). SQL-side
naming matches PostgreSQL conventions for anyone querying directly. Slightly larger
indexes than integers — irrelevant at this scale.

## ADR-010: Restrictive delete rules around audit records

**Status:** Accepted

**Context:** Audit data is the product. A cascading user delete that silently removes
audit sessions would be a compliance incident.

**Decision:** `onDelete: Restrict` from AuditSession/LogbookUpload to their owning User;
users are deactivated via `status`, not deleted. Branch deletion cascades its
sessions/uploads, but operational practice is status-based deactivation
(`BranchStatus.INACTIVE`).

**Consequences:** The database itself refuses to orphan an audit trail. Admin UX must
speak "deactivate", not "delete" (Users module, M4).

## ADR-011: Transport-based in-house logger

**Status:** Accepted

**Context:** Milestone 1 required logging _architecture_ without committing to a vendor.

**Decision:** A small level-filtered logger (`lib/logger`) with a `LogTransport`
interface; console transport ships now, vendor transports plug in later via
`addTransport()`. Transports are exception-isolated.

**Consequences:** Call sites (`logger.info(msg, { ids })`) never change when a vendor is
adopted. We accept maintaining ~100 lines of infrastructure instead of adopting pino now;
revisit if structured-logging needs outgrow it.

## ADR-012: Tailwind v4 + shadcn/ui with token-only styling

**Status:** Accepted

**Decision:** Tailwind CSS v4 with the design system expressed as CSS-variable tokens in
`styles/globals.css` (light + dark). shadcn/ui components are generated into
`components/ui` and owned by the repo. Components may only reference tokens.

**Consequences:** Dark mode is automatic for compliant components and _only_ for
compliant components — hence the hard rule in CODING_STANDARDS §7. No runtime CSS-in-JS
cost. shadcn updates are manual (we own the files) — acceptable for stability.

## ADR-013: Client-side app-shell components

**Status:** Accepted

**Context:** Navigation config carries Lucide icon _components_. During M1 verification,
rendering the server-side sidebar crashed: React cannot serialize functions across the
server→client boundary.

**Decision:** The shell pieces that consume icon-bearing config (`AppSidebar`, `Topbar`)
are client components; only serializable props (`role`, user fields) cross the boundary.

**Consequences:** Slightly larger client bundle (icons were heading there anyway via
`NavLinks`). General rule extracted into CODING_STANDARDS §4: config containing component
references stays on the client side of the boundary. Alternative rejected: icon-name
strings + a client-side registry — more indirection for no user-visible gain.

## ADR-014: pnpm with explicit build-script approvals

**Status:** Accepted

**Context:** pnpm ≥10 blocks dependency postinstall scripts by default (supply-chain
protection); Prisma, esbuild, and sharp legitimately need them. pnpm 11 reads approvals
from `pnpm-workspace.yaml`, not `package.json`.

**Decision:** Keep the protection; allowlist exactly the six packages that need builds in
`pnpm-workspace.yaml` (`allowBuilds`).

**Consequences:** New dependencies with postinstall scripts fail loudly until reviewed
and allowlisted — a feature, not a bug. The allowlist is part of code review surface.

## ADR-015: Interface-first capability seams (dependency inversion)

**Status:** Accepted _(Milestone 1.1)_

**Context:** Milestone 2+ introduces capabilities with external, swappable, or risky
implementations: AI providers, CRM access, the audit engine. Building the first
implementation directly into consumers would couple the platform to today's vendor and
make the planned replacements (Claude/Gemini, CRM API) refactors instead of swaps.

**Decision:** Define the contracts before any implementation exists. `services/ai/`,
`services/crm/`, and `services/audit/` contain interfaces (`AIProvider`, `CRMConnector`,
`AuditService`), shared types, and factories (`getAIProvider`, `getCRMConnector`,
`getAuditService`). Factories throw `NotImplementedError` (`lib/errors.ts`) until their
milestone lands. Once an interface has a shipped implementation, its contract is frozen —
changes require a new ADR.

**Consequences:** Consumers (pages, actions, the future audit engine) can be written
against stable contracts immediately; implementations are merge-time drop-ins.
Risk accepted: contracts designed ahead of implementations may prove wrong in M2/M3 —
they are cheap to amend _now_ precisely because nothing implements them yet, and types
are deliberately generic (`fields: Record<string, string>`, opaque step `output`) where
the M2 schema is still open.

## ADR-016: CRM access via the Strategy pattern

**Status:** Accepted _(Milestone 1.1)_

**Context:** CRM data will initially be read by browser automation against a legacy UI —
inherently fragile and certain to be replaced by a real API; tests need a mock. The rest
of the platform must not care which is active, or every connector change becomes a
platform change.

**Decision:** `CRMConnector` (`services/crm/crm-connector.ts`) is the strategy
interface: `healthCheck`, `fetchCustomerRecords`, `fetchRecordById`, all returning
normalized `CustomerRecord`s. `getCRMConnector()` is the single point of choice,
selected by the `CRM_CONNECTOR` env var (`browser-automation` | `api` | `mock`,
default `mock`). Connector kinds may not be referenced outside `services/crm/`.

**Consequences:** Swapping browser automation for the API is a config change plus one
new class — zero consumer edits. Normalization at the boundary means DOM artifacts and
CRM field names never contaminate the domain. The connector is read-only by contract
until a milestone explicitly changes that.

## ADR-017: Provider-independent AI layer

**Status:** Accepted _(Milestone 1.1)_

**Context:** The first AI provider will be OpenAI Vision; Claude, Gemini, and Azure
OpenAI are expected alternatives. Provider SDKs, prompts, and response shapes must not
spread through the codebase, or provider migration becomes a rewrite.

**Decision:** `AIProvider` (`services/ai/ai-provider.ts`) exposes capability-shaped,
provider-neutral operations — `extractLogbook`, `analyzeImage`, `generateSummary` — over
neutral types (`LogbookExtraction`, `ImageAnalysis`, `SummaryResult`, confidence as
0..1). `getAIProvider()` selects by `AI_PROVIDER` env var. Provider SDKs, names, model
ids, and prompt text are confined to `services/ai/` (implementations in M3).

**Consequences:** Provider choice becomes configuration; A/B-ing providers per
capability is possible later by extending the factory, not the callers. Images are
passed as `storageKey` references, which cleanly assumes the M2 object-storage decision.
Trade-off: a least-common-denominator interface — provider-unique features need a
deliberate interface extension (and ADR), which is the point.

## ADR-018: Typed in-process event bus

**Status:** Accepted _(Milestone 1.1)_

**Context:** The audit pipeline will emit lifecycle signals (uploads, OCR phases, CRM
reads, matching, completion/failure) that other modules — dashboard activity, future
Reports/notifications — should react to without the pipeline importing them. Kafka or
RabbitMQ would add operational burden wildly disproportionate to an internal monolith.

**Decision:** `lib/events` provides an `EventBus` interface with an `InMemoryEventBus`
implementation and a compile-time event catalog (`AppEventMap`: `logbook.uploaded`,
`ocr.started/completed`, `crm.read.started/completed`, `matching.started/completed`,
`audit.completed`, `audit.failed`). Envelopes carry id, timestamp, and correlation id.
Handlers are awaited sequentially and exception-isolated. Payloads carry IDs only.
Events are **notifications, not state** — workflow state persists in the database.

**Consequences:** Modules decouple through events with full type-safety (a renamed event
breaks compilation, not production). Because the bus is in-process and unpersisted,
anything that must survive a crash lives in the DB; if cross-process delivery is ever
needed, a transport implements the same `EventBus` interface (mirroring the logger's
transport pattern, ADR-011). The singleton is hot-reload-safe via `globalThis`, like the
Prisma client.

## ADR-019: No empty feature stubs — modules are created on demand

**Status:** Accepted _(Milestone 1.1; supersedes the M1 practice of pre-creating module folders)_

**Context:** M1 pre-created `features/{audit,crm,inventory,users,settings}` as empty
`.gitkeep` folders. They communicated intent but carried costs: they imply structure
decisions that each module should make when real requirements exist, and they rot (the
M1.1 module list already differs from M1's — HR and Accounting appeared).

**Decision:** Empty feature folders are deleted. A `features/<module>/` directory is
created when work on that module begins, following the playbook in DEVELOPMENT.md.
The roadmap — not the filesystem — is the statement of intent. `features/auth` and
`features/dashboard` remain (implemented); route-level placeholder _pages_ remain (they
are real, navigable UI).

**Consequences:** The tree only contains real code; nothing suggests a structure that
future requirements haven't earned. New-module scaffolding cost is one `mkdir` at the
moment it's actually needed.

## ADR-020: Validated, lazy server environment

**Status:** Accepted _(Milestone 1.1)_

**Context:** `process.env` reads were scattered and unvalidated; a missing or malformed
variable surfaced as a confusing downstream failure (e.g. Prisma connection error) rather
than a configuration message. New seam configuration (`AI_PROVIDER`, `CRM_CONNECTOR`)
needed a typed home.

**Decision:** `lib/config/env.ts` — a `server-only`, Zod-validated, lazily-parsed and
cached view of the environment (`getServerEnv()`), throwing `ConfigurationError` with
per-variable messages. Lazy parsing keeps `next build` independent of runtime-only
variables. Client code continues to see only `NEXT_PUBLIC_*` via normal Next.js inlining.

**Consequences:** Misconfiguration fails fast and legibly at first use. The env schema
is now the documented, typed catalog of server configuration alongside `.env.example`.
Pre-existing direct reads (logger level, site URL fallback) remain valid but new server
code should prefer `getServerEnv()`.

## ADR-021: Client-only, ephemeral upload staging (Sprint 2A.1)

**Status:** Accepted _(2026-07-13, Sprint 2A.1)_

**Context:** The sprint mandate was the upload _experience_ with zero backend: no
files saved, no records created. The UI still needs real state — validation, ordering,
rotation, previews — that later sprints must be able to persist without a rewrite.

**Decision:** The batch lives entirely in client memory: `File` objects + object URLs in
`hooks/use-image-upload.ts`, reusable presentation in `components/upload/`, and one
integration seam (`handleContinue`) where the 2A.2 server action will plug in.
Validation (10 MB/file, 20 images, JPG/PNG/HEIC, per-file rejection, duplicate detection
by name+size+lastModified) is a pure module reusable verbatim on the server. Rotation is
CSS-only metadata. "Continue" tells the truth: a toast stating nothing was saved.

**Consequences:** Zero backend surface to secure or migrate later; refreshing the page
intentionally discards the batch (acceptable — staging is seconds of work). The hook
computes state via a write-through ref rather than functional updaters, because adding
files has side effects (object-URL creation, rejection reporting) and React StrictMode
double-invokes updaters — this bug was caught live during browser verification.

## ADR-022: Vitest + React Testing Library for component tests

**Status:** Accepted _(2026-07-13, Sprint 2A.1)_

**Context:** The roadmap flagged tests as blocking before M2 mutations; Sprint 2A.1
introduced the first logic worth testing (validation rules, batch state). Jest's ESM/
Next-15 story is clunky; Vitest shares the Vite/esbuild toolchain and runs TSX natively.

**Decision:** Vitest (jsdom environment, explicit imports — no globals) with React
Testing Library. `vitest.setup.ts` shims object URLs/matchMedia and registers RTL
cleanup (auto-cleanup needs test globals, which are off). Tests are colocated
(`*.test.ts(x)`); `pnpm test` joins the quality gate for code with test coverage.

**Consequences:** 25 tests ship with the sprint; the pure-function pattern
(validation.ts) is now the house style for testable logic. E2E testing remains open —
the Playwright verification script used this sprint lives outside the repo; adopting it
as a real e2e suite is a candidate for 2A.2+.

## ADR-023: AuditSubmission as the audit aggregate root

**Status:** Accepted _(2026-07-13, Sprint 2A.1.5 — supersedes the M1 audit entity design; delete-rule intent of ADR-010 carries over unchanged)_

**Context:** The M1 schema modeled the audit module auditor-first: an `AuditSession`
(auditor + `scheduledFor`) containing `LogbookUpload`s that could float unattached
(`auditSessionId` nullable). Studying the real branch workflow for Sprint 2A
(select audit date → upload images → review → submit → OCR → OCR review → CRM
comparison → report) showed the anchor is a **branch-initiated act**, not an auditor's
working period — and persistence (2A.2) was about to freeze the wrong model. Candidates
evaluated: Upload Batch (transport packaging, not a business act), Audit Session
(auditor-centric container for what is actually one stage), Audit Job (infrastructure
framing), Audit Submission.

**Decision:** `AuditSubmission` — one branch's logbook submission for one audit date —
is the aggregate root; `LogbookImage` (renamed from `LogbookUpload`: "upload" names the
transfer event, not the thing) is owned by it (`Cascade`), always ordered
(`displayOrder`, from which page numbers are derived), and never reachable outside it.
Branch and User are referenced with `Restrict` (audit trail, ADR-010). Lifecycles are
formal state machines in docs/DOMAIN_MODEL.md (§5): forward-only after SUBMITTED,
failures return to the preceding reviewable state, CANCELLED only before machine
processing. Future entities (OcrResult, CrmComparison, AuditReport) are specified in
DOMAIN_MODEL.md but not persisted until their milestone (ADR-019). The unimplemented
`AuditService` contract and event catalog were re-termed to match (free per ADR-015 —
nothing implements them yet). DOMAIN_MODEL.md is the authoritative business model;
schema and code follow it.

**Consequences:** 2A.2 persistence lands on a model that matches the workflow instead of
contradicting it; no floating uploads, no auditor-required-at-creation. The empty M1
tables were dropped in migration `20260712231752_audit_submission_domain_model` — zero
data risk today, which is precisely why this review happened _before_ 2A.2. Open
questions that must be settled early in 2A.2 are recorded in DOMAIN_MODEL.md §8
(draft-persistence timing foremost).

## ADR-024: Storage provider abstraction with a local filesystem backend

**Status:** Accepted _(2026-07-13, Sprint 2A.2)_

**Context:** Sprint 2A.2 persists logbook image binaries. Cloud object storage
(S3/Azure/GCS/R2/Supabase) is the production destination but is not yet chosen, and
PROJECT_RULES 13 forbids binaries in PostgreSQL. Coupling upload code to any vendor SDK
now would make the storage decision a refactor instead of a configuration change.

**Decision:** `services/storage/` follows the established seam pattern (ADR-015): a
`StorageProvider` interface (`put`/`get`/`exists`/`delete`, Buffer-based — objects are
≤10 MB images), a `getStorageProvider()` factory selected by `STORAGE_PROVIDER` env
(default `local`), and one real implementation: `LocalStorageProvider` writing under the
gitignored `STORAGE_LOCAL_ROOT` with a `.meta.json` sidecar for content type. Keys are
opaque internal paths (`submissions/<submissionId>/<imageId>`); implementations must
reject traversal. `put` overwrites silently so upload retries are idempotent. Unbuilt
backends throw `NotImplementedError`.

**Consequences:** Adopting S3 later is one new class plus one env var. The local backend
makes single-node deployments and dev fully functional offline. Buffer (not stream) API
is a deliberate simplification recorded in the interface contract — revisit via ADR if
objects outgrow images.

## ADR-025: Draft persistence model and post-submit immutability enforcement

**Status:** Accepted _(2026-07-13, Sprint 2A.2 — resolves DOMAIN_MODEL.md §8 risk 1)_

**Context:** The domain model left open when a draft becomes a database row. Sprint 2A.2
also had to translate "submitted evidence is never modified" from documentation into
enforced behavior, and record business events (audit trail).

**Decision:**

1. **Drafts persist on first save, not first keystroke.** A new submission stages images
   client-side (2A.1 behavior preserved); "Save draft"/"Submit" creates the
   `AuditSubmission` row and uploads images one server-action call each (per-image
   failure isolation + retry; metadata rows survive storage failures as
   `UPLOAD_FAILED`). Reopened drafts restore date, images, order, and rotation from the
   server; further adds upload on the next save, removals apply immediately.
2. **Immutability is enforced in the service layer**, not the UI: every mutation path
   loads the aggregate via a guard that rejects non-DRAFT/UPLOADING states with
   `InvalidStateError`; submit itself re-checks status inside the transaction
   (`updateMany` with a status predicate) so concurrent submits cannot double-fire.
3. **`AuditTrailEntry`** (append-only, Cascade within the aggregate, Restrict on actor)
   records SUBMISSION_CREATED / DRAFT_SAVED / SUBMISSION_SUBMITTED / IMAGE_ADDED /
   IMAGE_REMOVED / IMAGE_REORDERED with IDs-only metadata. The event bus additionally
   publishes `submission.submitted` and `logbook.image.stored` for in-process reactions
   (ADR-018) — trail = record, bus = notification.
4. **Authorization is data-layer and testable**: service methods take an explicit
   `Actor` (id/role/branchId); Branch Managers are scoped to their branch, Auditors are
   read-only, Super Admins have full access. Unauthorized reads return NOT_FOUND, never
   confirming existence.

**Consequences:** No junk rows from abandoned date-picking; a crashed upload session
loses at most not-yet-uploaded files, never server state. The 2A.1 ephemeral-batch model
(ADR-021) is superseded for persistence but its UI and validation carry over intact.
Image binaries are served through an authenticated route handler
(`/api/images/[imageId]`) scoped exactly like submission reads.

## ADR-026: OCR architecture — versioned prompts, wrapped fields, recorded costs

**Status:** Accepted _(2026-07-13, Sprint 2B.0 — design only; implementation lands in Sprint 2B)_

**Context:** Sprint 2B implements OCR over submitted logbook images. Before any
provider code exists, the shape of the system had to be fixed: how provider
independence is preserved in practice, how prompt changes stay accountable, how
uncertainty is represented, and how cost is attributed — all cheap to decide now,
expensive to retrofit.

**Decision:** docs/OCR_ARCHITECTURE.md is the binding blueprint. Its load-bearing
choices: (1) OCR consumes the existing `AIProvider` seam; adapters translate to the
canonical schema at the boundary, and a deterministic `mock` provider ships first.
(2) Prompts are immutable versioned artifacts (`services/ai/prompts/<family>/v###.md`);
every request records prompt version + model + provider, enabling reproduction and A/B
comparison. (3) Extraction output wraps every field as
`{value, confidence, unreadable}` — per-field uncertainty is the unit the review UI,
partial extraction, and calibration all operate on; entry/page confidence aggregates by
`min()`. (4) Confidence bands (auto-accept ≥0.95 / highlight 0.80–0.94 / manual <0.80)
live in `SystemSetting`, and nothing bypasses human review in v1 — model confidence is
treated as uncalibrated until review verdicts accumulate. (5) One image = one request =
one `OcrResult` attempt; retries (max 3, backoff), a single JSON-repair pass, and
provider fallback are all recorded; unreadable handwriting is a review outcome, not an
error. (6) Every provider call writes a future `AiUsageRecord` (tokens, estimated cost,
latency) via a decorator at the AI boundary. (7) OCR never mutates submitted evidence;
downstream stages consume human-confirmed data only.

**Consequences:** Provider choice stays an env var; prompt regressions are diagnosable
and reversible; cost history exists from the first call. The known gap is explicit:
the real logbook page layout is unconfirmed — obtaining sample pages is the gating
input for prompt v001 (OCR_ARCHITECTURE §11). PROJECT_RULES gains the AI-call
recording rule (rule 23).

## ADR-027: CRM Discovery — read-only connector over a normalized snapshot model

**Status:** Accepted _(2026-07-13, Sprint 2B.1 — design only; implementation lands in Sprint 3)_

**Context:** The matching engine needs authoritative CRM facts (patient, treatments,
invoices, activity). The production CRM (`fermosaskincareclinic.com`) is a
server-rendered, session-cookie application with no API — reviewed via saved HTML
exports of its Dashboard, Patients Management, Patient Profile, Invoice, and Activity
Logs pages. The design had to fix, before any automation exists: what shape the rest
of the platform consumes, how browser automation stays maintainable against unversioned
markup, and how an eventual API swap costs nothing.

**Decision:** docs/CRM_DISCOVERY.md is the binding blueprint. Load-bearing choices:
(1) the `CRMConnector` contract narrows to three methods — `healthCheck`,
`findPatients`, `fetchPatientRecord` — speaking only the `NormalizedCrmPatientRecord`
model; pages, sessions, and selectors are invisible outside `services/crm/`.
(2) The connector is **read-only by contract**: search POSTs and GETs only, never the
CRM's mutating routes (lock/restore/create/deletion-request). (3) Every retrieval is a
**snapshot** stamped with `retrievedAt` + connector kind + selector-map version, stored
on `CrmComparison` so comparisons stay reproducible after the CRM changes — selector
maps are versioned artifacts, mirroring OCR prompt versioning (ADR-026). (4) Business
outcomes are data, not exceptions: `not-found` and `ambiguous` (with candidates, never
auto-picked) flow to review; only infrastructure failures throw (`CRM_UNAVAILABLE`,
`CRM_FORBIDDEN`, `CRM_LAYOUT`, `CRM_SESSION`), with layout drift detected by structural
fingerprints before parsing. (5) A PII-free `mock` connector modeled on the exports
ships first, so Sprint 4 matching develops without touching the real CRM. (6) CRM
patient identity is the `cid`, never names — exports show heavy name noise.

**Consequences:** Swapping browser automation for an API is one adapter + one env var;
matching is unblocked before automation exists. Costs accepted: selector maintenance is
recurring work, and discovery inherits gating inputs — the unexported login page, the
USER-column semantics question, and a sanctioned read-only service account
(CRM_DISCOVERY §8). PROJECT_RULES gains rule 24 (CRM access constraints).

## ADR-028: AuditFinding as the platform's canonical output

**Status:** Accepted _(2026-07-14, Sprint 3.5)_

**Context:** Four producers are converging — the rule engine (matching), CRM
discovery, OCR review, and AI analysis — plus manual review. Left alone, each would
invent its own result format, and the dashboard, reports, and review queue would
multiply integration shims forever. The output format had to be fixed before the first
producer ships.

**Decision:** `AuditFinding` (persisted, migration `20260713163129_audit_findings`) is
the single result format: every module creates or updates findings, none returns a
bespoke shape. Load-bearing choices: (1) owned by the `AuditSubmission` aggregate
(Cascade) and **never hard-deleted** — false positives are RESOLVED with a resolution
note, preserving the record of what the system once claimed. (2) Closed enums for
category (11 discrepancy kinds mapped to real business cases from the CRM reference
study), severity (INFO→CRITICAL), and `source` (provenance of the claim). (3) Status
is a linear workflow — OPEN → REVIEWED → RESOLVED with reopening — and resolution
always passes through review; transition rules live in one function (`canTransition`)
shared by UI and (future) service. (4) Evidence is a typed, Zod-validated JSON array
of references (logbook field / CRM record / CRM activity / note) — IDs only — so every
finding can prove itself and UIs can deep-link. (5) `expectedValue`/`actualValue` make
the discrepancy itself first-class rather than buried in prose. (6) The findings UI is
a reusable kit (`components/findings/`) fed today by mock data (PROJECT_RULES 28
banner) and tomorrow by rows — the kit renders `FindingView`, not Prisma types.

**Consequences:** The rule engine's deliverable shrinks to "emit findings"; dashboard
KPIs (VISION.md) are rollups over one table. Costs: enum changes require migrations +
doc updates, and the client-side enum mirror in the kit must stay in sync with the
Prisma enums (same accepted trade-off as `lib/auth/roles.ts`). The findings service
layer (persistence, branch scoping, status mutations with actor attribution) ships
with the first real producer.

## ADR-029: Orchestrator realizes the audit-engine seam

**Status:** Accepted _(2026-07-14, Sprint 3.6)_

**Context:** The audit lifecycle needed a coordination layer (jobs, stages, retry,
cancellation, progress) before OCR/CRM/matching integrations exist. The M1.1
`AuditService` seam already promised exactly this pipeline — but its sketched contract
also included submission CRUD, which 2A.2 shipped separately as
`auditSubmissionService`. Creating a parallel module would duplicate the seam.

**Decision:** `services/orchestrator/` IS the audit engine: `getAuditService()` now
returns the `AuditOrchestrator`, and the `AuditService` type is an alias of its public
API (contract frozen from 3.6). Load-bearing choices: (1) **jobs and stages persist**
(`AuditJob`/`AuditJobStage`, migration `20260713165731_audit_orchestration`) — recovery
derives from rows, never memory or bus events (OCR_ARCHITECTURE §8). (2) One
**state machine** (`QUEUED/RUNNING/WAITING/RETRYING/COMPLETED/FAILED/CANCELLED`)
governs jobs and stages; every mutation passes `assertTransition`, and DB updates are
guarded (`updateMany` re-checks the from-status) so concurrent transitions lose
loudly. (3) Stage work lives in **pluggable `StageExecutor`s** — mock executors ship
now; each real integration (OCR, CRM, matching, report) replaces one executor without
touching the orchestrator. HUMAN_REVIEW is genuinely a WAITING stage resumed by a
reviewer signal, exactly as it will always be. (4) The orchestrator maps active stages
onto the submission's §5.1 statuses (OCR→OCR_PROCESSING … REPORT→REPORT_GENERATION →
COMPLETED), so the domain state machine is now machine-driven. (5) Failure keeps the
run recoverable: stage FAILED → RETRYING → RUNNING with attempt counters; cancel is
terminal for the JOB but never touches the submission. (6) Event catalog gains
`audit.started`, `audit.stage.started/completed/failed`, `audit.cancelled`
(notifications only).

**Consequences:** OCR/CRM/matching integration becomes "replace an executor" — the
version 0.6.0 goal. Runs execute inline within the request (mock stages are fast);
when real OCR arrives, the executor loop moves behind a job runner without contract
changes. Progress (percentage, elapsed, estimated remaining) is computed from stage
rows, giving the UI a single source of truth.

## ADR-030: Deterministic rule engine emitting canonical findings

**Status:** Accepted _(2026-07-14, Sprint 3.7)_

**Context:** Matching logbook entries against CRM records is the platform's core
judgment, and it must be explainable to branch staff and management. AI is the wrong
tool for the first pass: rules are auditable, deterministic, testable one-by-one, and
free. The findings engine (ADR-028) already fixed the output format.

**Decision:** `services/rules/` — a pure, synchronous rule engine: `Rule` (id,
description, default weight, `evaluate(ctx) → RuleResult[]`), `RuleRegistry`
(pluggable; duplicate ids fail loudly), `RuleEngine` evaluator, and thirteen built-in
rules (patient name, treatment, therapist, invoice integrity, payment sums, branch,
date, duplicate patient/ambiguity, deleted treatment, edited treatment, missing CRM
record, missing invoice, duplicate entry). Load-bearing choices: (1) **input is
`ConfirmedEntry[]` + `NormalizedCrmPatientRecord[]` + `PatientResolution[]`; output is
`FindingDraft[]`** — never UI/OCR/CRM shapes; finding domain vocabulary moved to
`lib/findings.ts` so services never import components. (2) **Configuration is data**:
similarity threshold, time tolerance, severity weights, and per-rule enable/weight
overrides (`RuleEngineConfig`, defaults in code, SystemSetting-backed later).
(3) **Scoring**: risk = Σ severityWeight × ruleWeight per non-pass result, capped at
100; submissionScore = 100 − risk; `branchScore` averages submissions. (4) Name
matching is deliberately simple (normalize + token-set + Levenshtein) — smarter
matching is a future AI-assist, never a silent change to rules. (5) **Persistence via
`findingService`** (the ADR-028 "first producer" service): schema-validated evidence,
§5.5 transitions with timestamps, branch scoping, and idempotency per
(submission, source) — findings are never deleted, so re-runs must not duplicate.
(6) The orchestrator's MATCHING executor is the first REAL executor: it feeds the
engine simulated confirmed-OCR (deterministic mock provider) + connector-supplied CRM
records, and persists the findings. `/findings` is now DB-backed with persisted
workflow.

**Consequences:** Findings on screen are real rows with real provenance; OCR/CRM
integration later only improves the engine's INPUTS. Rule changes are reviewable code;
threshold changes are configuration. Known limitation: re-running matching after rule
changes will not refresh existing findings (idempotency guard) — a versioned-rerun
strategy is future work.

## ADR-031: Browser automation framework with a driver seam and mock-only implementation

**Status:** Accepted _(2026-07-14, Sprint 3.9)_

**Context:** CRM integration will drive the legacy CRM's web UI (CRM_DISCOVERY, ADR-027),
but live automation is gated on inputs we don't have (login capture, sanctioned service
account). Waiting would leave session handling, selector versioning, and failure
recovery undesigned until the riskiest possible moment.

**Decision:** `services/browser/` ships the complete framework with the real browser
abstracted behind a six-method `BrowserDriver` interface — `MockBrowserDriver` (an
in-memory, scriptable CRM simulation) is the ONLY implementation; the Playwright
driver arrives with sanctioned CRM integration and changes nothing above it.
Load-bearing choices: (1) **versioned SelectorRegistry** (`crm-selectors/v1`, shaped by
the reference captures) — selectors never live in page objects; a CRM redesign is a new
map version, and every page validates a structural **fingerprint** before use, failing
as CRM_LAYOUT naming the missing selector. (2) **Seven page objects** (Base + the six
CRM pages) own behavior only. (3) **BrowserSession**: login (CSRF-form style), logout,
expiry detection as the every-navigation invariant, ONE auto-reconnect, health check;
credentials in memory only. (4) **NavigationManager**: navigate → wait → verify →
recover, with retry limited to transient failures — CRM_FORBIDDEN, CRM_CHALLENGE
(CAPTCHA: stop, never bypass), and CRM_LAYOUT never retry. (5) **Policies as data**
(retry attempts/delay, navigation/action timeouts). (6) Typed error taxonomy shared
with CRM discovery (`CRM_TIMEOUT/LAYOUT/FORBIDDEN/SESSION/CHALLENGE/UNAVAILABLE`).
(7) `/dev/browser` (Super Admin) exercises everything against the mock: session,
navigation history, selector registry table, and armed failure simulations.

**Consequences:** Sprint 3's real CRM automation reduces to writing one Playwright
driver + confirming v1 selectors against the login capture. Recovery behavior is
already tested and demonstrable, so selector maintenance and session flakiness —
the two chronic costs of scraping — have their playbooks before the first real run.
