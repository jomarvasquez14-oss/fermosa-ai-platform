# Developer Guide

> Everything a new engineer needs to go from clone to green `release-check`.
> Deeper references: [ARCHITECTURE.md](ARCHITECTURE.md) ·
> [DEVELOPMENT.md](DEVELOPMENT.md) (module playbook) ·
> [PROJECT_RULES.md](PROJECT_RULES.md) (the non-negotiables) ·
> [AI_RULES.md](AI_RULES.md) (AI-assisted work).

## Local setup

1. **Prerequisites**: Node ≥ 20 (22 recommended), pnpm 11 (`corepack enable`),
   PostgreSQL 16 (a local install or Docker — the app only needs a reachable
   `DATABASE_URL`).
2. `pnpm install`
3. `cp .env.example .env` and fill in:
   - `DATABASE_URL` — your local Postgres
   - `AUTH_SECRET` — `openssl rand -base64 32` (any 32-byte secret for dev)
   - Leave `AI_PROVIDER=mock`, `CRM_CONNECTOR=mock`, `STORAGE_PROVIDER=local` —
     the platform is fully functional offline with the mock seams.
   - `ANTHROPIC_API_KEY` only if you intend to run the Claude provider in the
     AI Playground.
4. `pnpm db:migrate` (applies migrations) then `pnpm db:seed`.
5. `pnpm dev` → http://localhost:3000

## Database

- Schema: [`prisma/schema.prisma`](../prisma/schema.prisma); physical notes in
  [DATABASE.md](DATABASE.md); business meaning in [DOMAIN_MODEL.md](DOMAIN_MODEL.md).
- **Every schema change ships as a migration** (`pnpm db:migrate`) committed with
  the code (PROJECT_RULES 11). `db:push` never targets a shared database.
- `pnpm db:studio` opens Prisma Studio for inspection.
- Integration tests run against your `DATABASE_URL` (they create isolated
  throwaway branches/users and clean up after themselves). CI runs them against
  a disposable Postgres service container.

## Seeding

`pnpm db:seed` is idempotent (safe to re-run) and creates three demo accounts,
all with the password `ChangeMe@123` (LOCAL DEV ONLY — rotated anywhere shared):

| Email                   | Role                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| `admin@fermosa.local`   | Super Admin (sees dev tools: AI Playground, CRM Dev, Browser Dev) |
| `auditor@fermosa.local` | Auditor (findings queue, OCR review, audit runs)                  |
| `manager@fermosa.local` | Branch Manager (uploads submissions for their branch)             |

## Branch strategy

- `main` is always releasable; every merge to it is tagged history.
- One branch per sprint/change: `feature/<topic>` for business work,
  `chore/<topic>` for engineering work.
- Never commit directly to `main`; merge with `--no-ff` so sprint boundaries
  stay visible in history.

## Commit workflow

1. Work on your branch; keep the tree formatted (`pnpm format`).
2. Before every commit: `pnpm verify` (typecheck + lint + tests).
3. Review what you're staging (`git status` after `git add`) — secrets, local
   captures (`docs/crm-reference/`, `ocr-samples/`, `.env`, `.storage/`) are
   gitignored and must stay out.
4. Commit messages: imperative summary line, body explaining what/why per
   sprint or logical change.

## Release workflow

1. On the branch: `pnpm release-check` (typecheck → lint → tests → production
   build; stops on first failure). CI runs the same gates on push.
2. Merge into `main` with `--no-ff`, push.
3. Tag: `git tag -a vX.Y.Z -m "<summary>"` and `git push origin vX.Y.Z`.
4. Update [ROADMAP.md](ROADMAP.md) and the milestone doc as part of the branch,
   not after the merge.

## Running tests

| Command                       | What                                                |
| ----------------------------- | --------------------------------------------------- |
| `pnpm test`                   | Full suite once (unit + component + DB integration) |
| `pnpm test:watch`             | Watch mode                                          |
| `pnpm vitest run <path>`      | One file/folder (e.g. `services/rules`)             |
| `pnpm vitest run -t "<name>"` | Tests matching a name                               |

Conventions: colocated `*.test.ts(x)`; `// @vitest-environment node` for
non-DOM suites; integration suites import `tests/helpers/load-env` first and
clean up their own rows. Two footguns already paid for (don't repay them):
`beforeEach(() => mock.mockReset())` — the returned mock becomes a teardown
callback vitest will CALL; use braces. And `buildReviewPages`-style helpers
that servers need must not live in `"use client"` modules.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: install
(pnpm store cached) → typecheck → lint → migrations against a Postgres 16
service container → full test suite (summary in the job's step summary) →
production build. Steps fail fast; the pipeline is the same `release-check`
you run locally, so "green locally" and "green in CI" mean the same thing.

## Observability while developing

Structured spans (`lib/telemetry`) flow through the logger: audit runs are
correlated by job id (`correlationId`), each orchestrator stage and rule-engine
evaluation logs a timed `span` line. Watch the dev-server output while driving
an audit run to see the pipeline's timing story.
