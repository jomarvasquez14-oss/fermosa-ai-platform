# Decisions (ADR Log)

> Architecture Decision Records for the Fermosa AI Platform.
> Append-only: new decisions get the next number; reversals get a _new_ ADR that marks the old one **Superseded**. Never rewrite history.
>
> Format: Status · Context · Decision · Consequences. Keep each record short enough to read in a minute.

| #                                                                         | Decision                                                | Status   |
| ------------------------------------------------------------------------- | ------------------------------------------------------- | -------- |
| [ADR-001](#adr-001-modular-monolith)                                      | Modular monolith over microservices                     | Accepted |
| [ADR-002](#adr-002-nextjs-app-router-as-full-stack-framework)             | Next.js App Router as the full-stack framework          | Accepted |
| [ADR-003](#adr-003-feature-based-architecture-with-a-service-layer)       | Feature-based architecture with a service layer         | Accepted |
| [ADR-004](#adr-004-authjs-v5-with-credentials-provider)                   | Auth.js v5 with a Credentials provider (interim)        | Accepted |
| [ADR-005](#adr-005-jwt-sessions-over-database-sessions)                   | JWT sessions over database sessions                     | Accepted |
| [ADR-006](#adr-006-split-auth-configuration-for-the-edge-runtime)         | Split auth configuration for the Edge runtime           | Accepted |
| [ADR-007](#adr-007-permission-based-authorization-over-role-checks)       | Permission-based authorization over role checks         | Accepted |
| [ADR-008](#adr-008-role-as-a-table-backed-by-a-closed-enum)               | `Role` as a table backed by a closed enum               | Accepted |
| [ADR-009](#adr-009-cuid-primary-keys-and-snake_case-column-mapping)       | cuid primary keys and snake_case column mapping         | Accepted |
| [ADR-010](#adr-010-restrictive-delete-rules-around-audit-records)         | Restrictive delete rules around audit records           | Accepted |
| [ADR-011](#adr-011-transport-based-in-house-logger)                       | Transport-based in-house logger (no vendor yet)         | Accepted |
| [ADR-012](#adr-012-tailwind-v4--shadcnui-with-token-only-styling)         | Tailwind v4 + shadcn/ui with token-only styling         | Accepted |
| [ADR-013](#adr-013-client-side-app-shell-components)                      | Client-side app-shell components                        | Accepted |
| [ADR-014](#adr-014-pnpm-with-explicit-build-script-approvals)             | pnpm with explicit build-script approvals               | Accepted |
| [ADR-015](#adr-015-interface-first-capability-seams-dependency-inversion) | Interface-first capability seams (dependency inversion) | Accepted |
| [ADR-016](#adr-016-crm-access-via-the-strategy-pattern)                   | CRM access via the Strategy pattern                     | Accepted |
| [ADR-017](#adr-017-provider-independent-ai-layer)                         | Provider-independent AI layer                           | Accepted |
| [ADR-018](#adr-018-typed-in-process-event-bus)                            | Typed in-process event bus (no message broker)          | Accepted |
| [ADR-019](#adr-019-no-empty-feature-stubs--modules-are-created-on-demand) | No empty feature stubs — modules are created on demand  | Accepted |
| [ADR-020](#adr-020-validated-lazy-server-environment)                     | Validated, lazy server environment                      | Accepted |

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
