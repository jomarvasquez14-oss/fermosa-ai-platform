# AI Rules

> Fermosa AI Platform — binding rules for AI-assisted development.
> Audience: any AI coding assistant (and any human pairing with one) making changes to
> this repository. These rules operationalize [PROJECT_RULES.md](PROJECT_RULES.md) for
> automated contributors; where they overlap, PROJECT_RULES is authoritative.

## Before Writing Any Code

1. **Always read the architecture documents before coding.** Minimum reading order for
   any non-trivial change:
   [PROJECT_RULES.md](PROJECT_RULES.md) → [ARCHITECTURE.md](ARCHITECTURE.md) →
   [CODING_STANDARDS.md](CODING_STANDARDS.md), plus [DATABASE.md](DATABASE.md) for schema
   work and [DECISIONS.md](DECISIONS.md) for anything touching a past decision.
2. **Confirm the work is in scope for the current milestone**
   ([ROADMAP.md](ROADMAP.md)). Features scheduled later are not started early; when a
   request conflicts with the roadmap, surface the conflict instead of silently building.

## Layering (never bypass)

3. **Never bypass the Service Layer.** All data access flows through `services/*`.
4. **Never access Prisma directly from UI components, pages, features, or server
   actions.** Only `services/*` and `prisma/seed.ts` import the ORM — no exceptions.
5. **Never duplicate business logic.** Before writing a helper, search for an existing
   one (`lib/`, `utils/`, `services/`, the owning feature). Duplication found during a
   change is consolidated in that change.
6. **Features stay isolated.** No feature imports another feature; shared code is
   promoted to `components/shared`, `lib/`, or `services/`.

## Extensibility Seams (keep them sealed)

7. **AI providers must be replaceable.** Depend only on the `AIProvider` interface via
   `getAIProvider()` (`services/ai/`). No provider SDK imports, provider names, model
   ids, or prompt assumptions anywhere else in the codebase.
8. **CRM connectors must be replaceable.** Depend only on the `CRMConnector` interface
   via `getCRMConnector()` (`services/crm/`). No code outside `services/crm/` may know
   whether browser automation, an API, or a mock is active.
9. **The audit pipeline is consumed through `AuditService`** (`services/audit/`), and
   cross-module reactions go through the event bus (`lib/events`) — never by one module
   calling into another's internals.
10. **New features must be modular**: follow the module playbook in
    [DEVELOPMENT.md](DEVELOPMENT.md) (schema → service → feature → thin route → access
    control → navigation). A feature that can't be described that way needs an ADR first.

## Documentation Duties (same change, not "later")

11. **Every milestone must update [ROADMAP.md](ROADMAP.md)** — status when work
    completes, scope changes when scope moves.
12. **Every architecture decision must update [DECISIONS.md](DECISIONS.md)** — append a
    new ADR; never rewrite or delete existing ones. Changing a frozen interface
    (`AIProvider`, `CRMConnector`, `AuditService`, `AppEventMap`) always counts as an
    architecture decision.
13. Structural changes update [ARCHITECTURE.md](ARCHITECTURE.md); schema changes update
    [DATABASE.md](DATABASE.md); new conventions update
    [CODING_STANDARDS.md](CODING_STANDARDS.md).

## Quality Bar

14. Run `pnpm typecheck && pnpm lint && pnpm build` before declaring work done; UI
    changes are verified in the running app (mobile + desktop, light + dark).
15. Access control on anything new: middleware map (`ROUTE_ACCESS`), server guard
    (`requirePermission`), and role-filtered navigation — all three, per
    [ARCHITECTURE.md §5](ARCHITECTURE.md#5-authorization-rbac).
16. Unimplemented seams **throw `NotImplementedError`** (`lib/errors.ts`) — never return
    fake success, never stub silently.
17. Log through `lib/logger` with IDs only; never log secrets, tokens, or entities.
