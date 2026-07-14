# Architecture

> Fermosa AI Platform — technical architecture reference.
> Audience: engineers building on or reviewing this codebase.
> Related: [PRODUCT.md](PRODUCT.md) · [DECISIONS.md](DECISIONS.md) · [CODING_STANDARDS.md](CODING_STANDARDS.md) · [PROJECT_RULES.md](PROJECT_RULES.md) · [DATABASE.md](DATABASE.md)

## 1. System Overview

The platform is a **modular monolith**: a single Next.js 15 (App Router) application in
which business modules are isolated under `features/` and share one set of infrastructure
(`lib/`, `services/`, `components/`). It deploys as one unit against one PostgreSQL
database.

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React 19 client components (forms, navigation, theme)          │
└──────────────┬──────────────────────────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────────────────────────┐
│  Next.js 15 application                                          │
│                                                                  │
│  Edge runtime          Node runtime                              │
│  ┌──────────────┐      ┌─────────────────────────────────────┐   │
│  │ middleware.ts │      │ Server Components / Server Actions  │   │
│  │ (JWT check +  │      │ app/ → features/ → services/        │   │
│  │  route RBAC)  │      │              → lib/db (Prisma)      │   │
│  └──────────────┘      │  services/{ai,crm,audit} interfaces │   │
│                        │  + lib/events in-process bus (§11-12)│   │
│                        └───────────────────┬─────────────────┘   │
└──────────────────────────────────────────── │ ────────────────────┘
                                              ▼
                                      PostgreSQL (Prisma ORM)
```

Why a monolith: one team, one deploy target, low operational cost. Why modular: features
are import-isolated (enforced by convention and review), so a module can be extracted into
its own service later without untangling the codebase. See [DECISIONS.md](DECISIONS.md) §ADR-001.

## 2. Technology Stack

| Layer      | Technology                                      | Notes                                                 |
| ---------- | ----------------------------------------------- | ----------------------------------------------------- |
| Framework  | Next.js 15 (App Router), React 19               | Server Components by default                          |
| Language   | TypeScript, strict + `noUncheckedIndexedAccess` | No `any` in application code                          |
| Styling    | Tailwind CSS v4, shadcn/ui, next-themes         | Design tokens as CSS variables; class-based dark mode |
| ORM        | Prisma 6                                        | PostgreSQL; snake_case table mapping                  |
| Auth       | Auth.js (NextAuth v5), JWT strategy             | Credentials provider in v1                            |
| Validation | Zod (+ React Hook Form on the client)           | Same schema on both sides of the wire                 |
| Testing    | Vitest, React Testing Library (jsdom)           | Colocated `*.test.ts(x)`; `pnpm test` (ADR-022)       |
| Tooling    | pnpm, ESLint 9 (flat config), Prettier          | `pnpm-workspace.yaml` holds build approvals           |

## 3. Folder Structure & Layering

```
├── app/                     # Routes ONLY — thin pages that guard + compose
│   ├── (auth)/              # Public: login
│   ├── (app)/               # Authenticated shell (sidebar + topbar layout)
│   ├── api/auth/[...nextauth]/  # Auth.js handler
│   ├── forbidden/ unauthorized/ # 403 / 401 pages
│   └── error / global-error / not-found  # 500 / 404
├── components/
│   ├── ui/                  # shadcn/ui primitives (generated, repo-owned)
│   ├── layout/              # App shell: sidebar, topbar, breadcrumbs, user menu
│   ├── shared/              # PageHeader, ErrorState, ModulePlaceholder, Logo, ...
│   ├── upload/              # Reusable upload kit: dropzone, cards, preview (2A.1)
│   └── providers/           # Client context providers (theme)
├── features/<module>/       # Business modules: actions/, components/, schemas/, data/
│                            # (created when work on a module begins — no empty stubs)
├── lib/
│   ├── auth/                # RBAC matrix, Auth.js config (split), session guards
│   ├── config/              # Site metadata, navigation, validated env (env.ts)
│   ├── db/                  # Prisma client singleton
│   ├── events/              # Typed in-process event bus (§12)
│   ├── logger/              # Transport-based logging service
│   └── errors.ts            # AppError taxonomy (NotImplementedError, ...)
├── services/
│   ├── *-service.ts         # Data-access services — the ONLY code importing Prisma
│   ├── ai/                  # AIProvider seam: ocr-schema, prompts/ (versioned),
│   │                        #   providers/mock (3.0); real providers in 3.x (§11)
│   ├── crm/                 # CRMConnector strategy interface + factory (§11)
│   ├── audit/               # AuditService seam → orchestrator (ADR-029, §11)
│   ├── orchestrator/        # Audit workflow engine: jobs, stages, state machine (3.6)
│   ├── rules/               # Deterministic rule engine → findings (3.7, ADR-030)
│   ├── browser/             # Browser automation: driver seam, Playwright + mock drivers,
│   │                        #   versioned selectors, page objects, session/navigation
│   │                        #   (3.9 ADR-031; real driver M0041 ADR-033)
│   └── storage/             # StorageProvider seam + local backend (2A.2, ADR-024)
├── hooks/ types/ utils/     # Shared hooks, global types, pure helpers
├── prisma/                  # schema.prisma, migrations, seed.ts
└── styles/                  # globals.css (Tailwind entry + design tokens)
```

### Dependency rules (enforced in review)

```
app/ ──► features/ ──► services/ ──► lib/db (Prisma)
  │          │
  └──────────┴──► components/, lib/, hooks/, utils/, types/
```

1. **Routes are thin.** A page enforces access and composes feature components. Business
   logic in `app/` is a defect.
2. **Features are isolated.** `features/audit` must never import from `features/crm`.
   Shared code is promoted to `components/shared`, `lib/`, or `services/`.
3. **Services own data access.** Only `services/*` (plus `prisma/seed.ts`) import the ORM.
   Invariants that must always hold (e.g. "a Branch Manager only sees the assigned branch")
   are implemented in the service so every caller inherits them.
4. **`lib/` is leaf-level infrastructure** — it never imports from `features/` or `app/`.
   (Exception by design: `lib/auth/index.ts` imports the login Zod schema and user service,
   because credential verification is intrinsically the auth feature's contract.)

## 4. Authentication

Auth.js v5, Credentials provider, **JWT sessions** (8-hour lifetime — see ADR-005).

The configuration is split to keep the Edge bundle clean:

| File                      | Runtime   | Contents                                                                                                |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `lib/auth/auth.config.ts` | Edge-safe | Pages, session strategy, `authorized`/`jwt`/`session` callbacks. No Prisma/bcrypt.                      |
| `lib/auth/index.ts`       | Node only | Credentials provider (Prisma lookup + bcrypt compare); exports `auth`, `signIn`, `signOut`, `handlers`. |
| `middleware.ts`           | Edge      | `NextAuth(authConfig).auth` — must never import `lib/auth/index.ts`.                                    |

Sign-in flow: login form (React Hook Form + Zod) → `signIn("credentials")` →
`authorize()` re-validates with the same Zod schema, loads the user via
`services/user-service`, rejects non-`ACTIVE` users, compares bcrypt hashes → JWT is minted
carrying `id`, `role`, `branchId`. The session callback copies those claims onto
`session.user` (typed via module augmentation in `types/next-auth.d.ts`).

Because the JWT carries role and branch, **authorization decisions require no database
round-trip** on normal requests.

## 5. Authorization (RBAC)

Single source of truth: [`lib/auth/roles.ts`](../lib/auth/roles.ts).

- `ROLES` — `SUPER_ADMIN`, `AUDITOR`, `BRANCH_MANAGER` (mirrors the Prisma `RoleName` enum;
  duplicated deliberately to keep the Edge bundle Prisma-free).
- `PERMISSIONS` + `ROLE_PERMISSIONS` — capability matrix. Pages ask for capabilities
  (`requirePermission("reports:view")`), not roles, so adding a role is a one-file change.
- `ROUTE_ACCESS` — pathname-prefix → allowed-roles map consumed by middleware.

Enforcement is layered (defense in depth):

| Layer                | Mechanism                                                                                      | Failure mode                                              |
| -------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1. Middleware (Edge) | `authorized` callback: session check + `ROUTE_ACCESS`                                          | Redirect to `/login` (with `callbackUrl`) or `/forbidden` |
| 2. Server guards     | `requireUser` / `requireRole` / `requirePermission` in layouts & pages (`lib/auth/session.ts`) | `redirect()` to `/login` or `/forbidden`                  |
| 3. Services          | Scoped queries (e.g. `branchService.findAssigned`)                                             | Data is never fetched, regardless of caller               |
| 4. UI                | `getNavForRole` filters the sidebar                                                            | Cosmetic only — never relied upon for security            |

Current matrix:

| Capability           | Super Admin |  Auditor   | Branch Manager |
| -------------------- | :---------: | :--------: | :------------: |
| Dashboard            |     ✅      |     ✅     |       ✅       |
| Audit (view/manage)  |     ✅      |     ✅     |   view only    |
| Reports              |     ✅      |     ✅     |       —        |
| Branches             |     all     | all (view) | assigned only  |
| Users administration |     ✅      |     —      |       —        |
| System settings      |     ✅      |     —      |       —        |

## 6. Request Lifecycles

**Unauthenticated page request** → middleware matcher hits → no JWT →
`Response.redirect(/login?callbackUrl=…)`. Unknown paths behave the same way, so
unauthenticated users cannot probe which routes exist.

**Authenticated page request** → middleware validates JWT + route roles → layout
(`app/(app)/layout.tsx`) calls `requireUser()` and renders the shell → page calls its
guard and composes feature components → feature components call services for data.

**Mutation (Milestone 2+)** → client form validated by Zod → server action re-validates
with the same schema → guard (`requirePermission`) → service call → `revalidatePath`.
Server actions live in `features/<module>/actions/`.

## 7. Error Handling

| Concern                 | Implementation                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 404                     | `app/not-found.tsx` (shared `ErrorState` component)                                                                        |
| 401                     | `app/unauthorized/page.tsx`; in practice middleware redirects to `/login` first                                            |
| 403                     | `app/forbidden/page.tsx`; target of middleware + server-guard redirects                                                    |
| 500 (route)             | `app/error.tsx` — client boundary, logs via `lib/logger`, offers reset                                                     |
| 500 (root layout crash) | `app/global-error.tsx` — self-contained, renders its own `<html>` with inline styles because app providers are unavailable |

## 8. Logging

`lib/logger` is a level-filtered (`LOG_LEVEL` env, default `debug` dev / `info` prod),
transport-based singleton. Milestone 1 ships a console transport. Adopting an external
sink (Datadog, Sentry, Axiom) means implementing the `LogTransport` interface and
registering it with `logger.addTransport()` — zero call-site changes. Transports are
isolated: a throwing transport can never crash a request.

## 9. UI System

- **Design tokens** are CSS variables in `styles/globals.css` with light and dark values;
  components reference tokens (`bg-background`, `text-muted-foreground`) — never raw colors.
- **Dark mode** is class-based via `next-themes` (`.dark` on `<html>`, system default,
  user-togglable, no flash thanks to `suppressHydrationWarning`).
- **shadcn/ui** primitives are generated into `components/ui` and owned by the repo.
- **Responsive shell**: fixed 16rem sidebar at `lg`+; below that, a sheet-based hamburger
  menu in the topbar. Verified at 375px, 768px, and desktop widths.
- **Server/client boundary rule**: nav config carries Lucide icon _components_, which are
  functions and cannot be serialized across the RSC boundary — therefore the sidebar and
  topbar are client components. Keep icon-bearing config on the client side of the boundary.

## 10. Environments & Configuration

All configuration is via environment variables (`.env`, documented in `.env.example`):
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `NEXT_PUBLIC_APP_URL`, `LOG_LEVEL`.
Secrets never enter the repository; `.env*` is gitignored. The Prisma client is a
`globalThis` singleton to survive dev hot-reload without exhausting connections.

## 11. Service Abstractions & Dependency Inversion

_(Introduced in Milestone 1.1 — see ADR-015…017.)_

Capabilities that are external, swappable, or not yet built are consumed through
**interfaces + factories** under `services/`; the application never depends on a concrete
implementation. Factories throw `NotImplementedError` for strategies whose milestone
has not landed yet.

| Seam    | Interface                                                                                                                                              | Factory                | Strategies                                                                        | Selection                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| AI      | `AIProvider` — `extractLogbook`, `analyzeImage`, `generateSummary`; OCR design in [OCR_ARCHITECTURE.md](OCR_ARCHITECTURE.md) (ADR-026)                 | `getAIProvider()`      | **mock (shipped, 3.0)** → claude, openai-vision, gemini, azure-openai (3.x)       | `AI_PROVIDER` env or explicit argument                         |
| CRM     | `CRMConnector` — `healthCheck`, `findPatients`, `fetchPatientRecord`; discovery design in [CRM_DISCOVERY.md](CRM_DISCOVERY.md) (ADR-027)               | `getCRMConnector()`    | **mock (3.4)**, **browser-automation/Playwright (M0041, ADR-033)** → api (future) | `CRM_CONNECTOR` env (alias: `playwright`) or explicit argument |
| Audit   | `AuditService` — submission lifecycle + step pipeline (`AUDIT_STEPS`), first-class retry; domain model in [DOMAIN_MODEL.md](DOMAIN_MODEL.md) (ADR-023) | `getAuditService()`    | audit engine (M2)                                                                 | —                                                              |
| Storage | `StorageProvider` — `put`, `get`, `exists`, `delete` over opaque keys (ADR-024)                                                                        | `getStorageProvider()` | **local (shipped, 2A.2)**; s3, azure-blob, gcs, r2, supabase (future)             | `STORAGE_PROVIDER` env or explicit argument                    |

Boundary rules (binding, see [PROJECT_RULES.md](PROJECT_RULES.md) and
[services/README.md](../services/README.md)):

- Nothing outside `services/ai/` may import a provider SDK or mention a provider/model
  name; nothing outside `services/crm/` may know which connector strategy is active
  (classic **Strategy pattern** — the factory is the single point of choice).
- Implementations translate at the boundary: source-specific field names, errors, and
  artifacts never leak past the interface; failures become `AppError` subclasses
  (`lib/errors.ts`).
- Once an interface gains its first implementation, its contract is frozen — changes
  require an ADR.
- The audit pipeline is deliberately open-ended: steps are data (`AUDIT_STEPS`), step
  outputs are opaque at the pipeline level, so adding steps (e.g. a future
  double-review) never changes the interface.

Validated configuration for these seams (and everything else server-side) comes from
`lib/config/env.ts` — a lazily-parsed, Zod-validated, `server-only` view of
`process.env` that fails fast with precise messages.

## 12. Event Architecture

_(Introduced in Milestone 1.1 — see ADR-018.)_

`lib/events` provides a **typed in-process event bus** — deliberately not Kafka/RabbitMQ.
The event catalog (`AppEventMap`) is a closed, compile-time map of
`domain.action` names to payloads:

`submission.submitted` · `logbook.image.stored` · `ocr.started` · `ocr.completed` ·
`crm.read.started` · `crm.read.completed` · `matching.started` · `matching.completed` ·
`audit.completed` · `audit.failed`

Semantics:

- `appEvents.publish(name, payload, { correlationId })` wraps the payload in an
  `EventEnvelope` (id, timestamp, correlation id) and awaits handlers sequentially;
  a throwing handler is logged and isolated, never breaking the publisher.
- **Events are notifications, not state.** Workflow state lives in the database (audit
  step results persist via the data layer); events die with the process by design.
- Payloads carry **IDs only** — subscribers load entities through services.
- Cross-module reactions (e.g. a future Reports module reacting to `audit.completed`)
  subscribe to events instead of importing another module's internals.
- The bus is consumed through the `EventBus` interface; if cross-process delivery is
  ever required, a transport replaces `InMemoryEventBus` with zero call-site changes.

## 13. Known Constraints & Future Considerations

- **JWT revocation** is by expiry (8h) only. If instant revocation becomes a requirement,
  switch to database sessions (ADR-005 documents the trade-off).
- **Credentials auth is interim.** SSO (Microsoft Entra ID / Google Workspace) is the
  intended production path; with Auth.js this is an additive provider change.
- **File storage**: `LogbookUpload.storageKey` anticipates S3/Azure Blob object storage.
  Binaries never go in PostgreSQL.
- **Extraction path**: because features are import-isolated and all data access flows
  through services, a module can graduate to its own service by lifting its feature +
  service + schema slice.
