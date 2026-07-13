# Project Rules

> Fermosa AI Platform — the non-negotiables.
> [CODING_STANDARDS.md](CODING_STANDARDS.md) says how we prefer to write code; this file
> lists the rules a change **must** satisfy to merge. They exist because each one guards
> something that is expensive or impossible to fix after the fact. Exceptions require an
> ADR in [DECISIONS.md](DECISIONS.md), agreed before the code lands.

## Security & Access Control

1. **Every route is protected by default.** The middleware matcher covers everything
   except explicitly public paths (`/login`, `/unauthorized`, `/forbidden`). Adding a
   public path means editing `PUBLIC_PATHS` in `lib/auth/auth.config.ts` — and justifying
   it in review.
2. **Server-side guards are mandatory, UI checks are cosmetic.** Every page under
   `app/(app)/` calls `requireUser`, `requireRole`, or `requirePermission`; every server
   action guards itself before doing work. Hiding a button is never access control.
3. **All authorization flows through the matrix.** New capabilities are added to
   `PERMISSIONS`/`ROLE_PERMISSIONS` (and `ROUTE_ACCESS` if route-gated) in
   `lib/auth/roles.ts`. Inline role comparisons in pages or components are a defect.
4. **Branch scoping is a data-layer invariant.** Any query that can return branch-owned
   data must scope by the caller's `branchId` when the caller is a Branch Manager —
   implemented in the service, not the page.
5. **Secrets never enter the repository.** No credentials, tokens, or connection strings
   in code, comments, docs, logs, or commits. Configuration goes through environment
   variables documented in `.env.example` (with placeholder values only).
6. **Auth inputs are validated server-side.** Client validation (React Hook Form) is UX;
   the server action / `authorize()` re-validates with the same Zod schema. Login
   failures never reveal whether an account exists.

## Architecture Boundaries

7. **Only `services/*` and `prisma/seed.ts` import Prisma.** No page, feature, component,
   or lib module (outside `lib/db`) touches the ORM.
8. **Features never import other features.** Shared code is promoted to
   `components/shared`, `lib/`, `services/`, or `utils/` — in the same change, not "later".
9. **`middleware.ts` imports only edge-safe modules** (`lib/auth/auth.config.ts`,
   `lib/auth/roles.ts`). Importing `lib/auth/index.ts`, Prisma, or bcrypt into middleware
   breaks the Edge build — treat any new middleware import with suspicion.
10. **Routes stay thin.** Business logic in `app/` is moved to the owning feature or
    service before merge.

## Data

11. **Schema changes ship as migrations** committed alongside the code that requires
    them. `db:push` never targets a shared database.
12. **Audit-trail records are never hard-deleted**, and delete rules that could cascade
    into them use `Restrict`. Users and branches are deactivated via `status`, not
    removed. (ADR-010.)
13. **File binaries never enter PostgreSQL** — object storage keys only
    (`LogbookImage.storageKey`).
14. **The audit domain model is authoritative.** Entity names, aggregate boundaries,
    and state transitions follow [DOMAIN_MODEL.md](DOMAIN_MODEL.md) (ADR-023); code
    that disagrees with it is a bug. Model changes update that document first, with an
    ADR.
15. **The seed stays idempotent.** Running `pnpm db:seed` twice must be safe.

## Quality Gates

16. **A change merges only when `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass**
    (run manually until CI exists; CI adoption is an M1 follow-up in
    [ROADMAP.md](ROADMAP.md)).
17. **Strictness is never lowered to make code compile.** No disabling TypeScript strict
    flags, no `eslint-disable` without an inline justification comment, no
    `ignoreBuildErrors`.
18. **UI changes are verified in the running app** at mobile (375px) and desktop widths,
    in both light and dark themes. Token-only styling (no hard-coded colors) is a merge
    requirement.
19. **New primitives come from shadcn, not hand-rolled lookalikes**, and land in
    `components/ui`.

## Extensibility Seams

20. **Swappable capabilities are consumed through their interfaces only.** AI goes
    through `AIProvider` via `getAIProvider()`; CRM goes through `CRMConnector` via
    `getCRMConnector()`; the audit pipeline through `AuditService`; binary storage
    through `StorageProvider` via `getStorageProvider()`. Provider SDKs, provider/model
    names, connector kinds, and storage backends never appear outside their own
    `services/<seam>/` folder. (ADR-015…017, ADR-024.)
21. **Cross-module reactions go through the event bus** (`lib/events`), with payloads
    carrying IDs only. Events are notifications — state that must survive a restart
    lives in the database. (ADR-018.)
22. **Unimplemented seams throw `NotImplementedError`** — never fake success, never
    silent stubs.
23. **Every AI call is accountable.** Prompts are immutable versioned artifacts
    (`services/ai/prompts/<family>/v###.md`); every provider request records prompt
    version, model, and provider (plus tokens/cost/latency once available), and AI
    output is validated against a schema at the provider boundary. Extractions never
    bypass human review, and raw AI output is never presented as confirmed data.
    ([OCR_ARCHITECTURE.md](OCR_ARCHITECTURE.md), ADR-026.)
24. **CRM access is read-only, snapshotted, and PII-safe.** The connector never calls
    a mutating CRM route; every retrieval is stamped (`retrievedAt`, connector kind,
    selector-map version) and consumers read snapshots, not live pages. CRM page
    exports and captures never enter the repository; patient contact fields are
    masked in UIs by default. ([CRM_DISCOVERY.md](CRM_DISCOVERY.md), ADR-027.)

## Documentation & Process

25. **Docs move with the code.** A change that alters architecture, access control, the
    schema, or conventions updates the relevant `docs/` file in the same change. The docs
    set (`ARCHITECTURE`, `PRODUCT`, `ROADMAP`, `CODING_STANDARDS`, `DECISIONS`,
    `PROJECT_RULES`, `AI_RULES`, `DOMAIN_MODEL`, `OCR_ARCHITECTURE`, `CRM_DISCOVERY`,
    `DATABASE`, `DEVELOPMENT`) is part of the codebase, not an appendix. AI-assisted contributors additionally follow
    [AI_RULES.md](AI_RULES.md).
26. **Significant decisions get an ADR** — append-only, in
    [DECISIONS.md](DECISIONS.md). "Significant" means: anyone would ask _why is it like
    this?_ a year from now.
27. **Milestone scope is explicit.** Work scheduled for a later milestone (OCR, AI
    features, upload module, CRM integration, browser automation — per current direction)
    is not started early without a roadmap change agreed by the project lead.
28. **Placeholder honesty.** Unbuilt functionality renders the standard
    `ModulePlaceholder` state — never dead buttons or silently broken flows.

---

_Rules are amended by editing this file together with an ADR recording the change and its
rationale._
