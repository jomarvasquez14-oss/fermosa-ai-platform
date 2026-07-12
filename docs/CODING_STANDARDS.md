# Coding Standards

> Fermosa AI Platform — how code is written here.
> These standards are binding; deviations need a reviewer's sign-off and, if lasting, an ADR.
> Related: [PROJECT_RULES.md](PROJECT_RULES.md) (non-negotiables) · [DEVELOPMENT.md](DEVELOPMENT.md) (how-to guides)

## 1. TypeScript

- **Strict mode is law.** `strict`, `noUncheckedIndexedAccess`, and
  `noFallthroughCasesInSwitch` are enabled; code must compile with `pnpm typecheck` clean.
- **No `any`.** Prefer narrowing, generics, or `unknown` + type guards
  (see `isAppRole` in `lib/auth/roles.ts` for the house pattern).
- **`as const` objects over TS enums** for closed sets (`ROLES`, `PERMISSIONS`,
  `LOG_LEVELS`), with a derived union type. Prisma enums are the one exception — they are
  generated.
- **Type-only imports** use `import type`. Module augmentation lives in `types/*.d.ts`
  (see `types/next-auth.d.ts`).
- Unused variables are errors; prefix intentional discards with `_`.

## 2. Project Layout & Imports

- Always import via the **`@/` alias** — never relative paths that traverse top-level
  folders (`../../lib/...`).
- Respect the layering in [ARCHITECTURE.md §3](ARCHITECTURE.md#3-folder-structure--layering):
  routes → features → services → Prisma. **Only `services/*` and `prisma/seed.ts` may
  import `@prisma/client` or `lib/db/prisma`.**
- **No cross-feature imports.** Shared code is promoted upward
  (`components/shared`, `lib/`, `services/`, `utils/`).
- One exported "thing" per file where practical; group by module, not by kind, inside
  features.

## 3. Naming

| Item              | Convention                                                        | Example                                |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------- |
| Files & folders   | `kebab-case`                                                      | `login-form.tsx`, `user-service.ts`    |
| React components  | `PascalCase` export, kebab-case file                              | `LoginForm` in `login-form.tsx`        |
| Hooks             | `use-` prefix                                                     | `use-media-query.ts` → `useMediaQuery` |
| Services          | `<domain>-service.ts` exporting `<domain>Service`                 | `userService`                          |
| Zod schemas       | `<thing>Schema` + inferred `<Thing>Input`                         | `loginSchema`, `LoginInput`            |
| Server actions    | verb-first, `-action` suffix on the function                      | `signOutAction`                        |
| Constants         | `SCREAMING_SNAKE_CASE`                                            | `MAIN_NAV`, `ROUTE_ACCESS`             |
| DB tables/columns | `snake_case` via `@@map`/`@map`; models stay PascalCase/camelCase | `logbook_uploads.storage_key`          |

## 4. React & Next.js

- **Server Components by default.** Add `"use client"` only for state, effects, event
  handlers, or browser APIs — and know that everything it imports joins the client bundle.
- **Never pass non-serializable values (functions, class instances, component references)
  from a server component to a client component.** This includes icon components inside
  config objects — the shell's sidebar/topbar are client components for exactly this
  reason.
- **Pages are thin**: metadata + access guard + composition. Logic lives in features.
- **Mutations are server actions** in `features/<module>/actions/`, marked `"use server"`,
  guarded (`requirePermission`) and Zod-validated _inside_ the action — client-side
  validation is UX, not security.
- Wrap `useSearchParams` consumers in `<Suspense>`.
- Every page exports `metadata` (the root layout provides the title template).
- Use `next/link` for navigation, `next/font` for fonts; never raw `<a>` for internal
  routes.

## 5. Validation & Data Boundaries

- **Every external input crosses a Zod schema**: form values, server-action arguments,
  route params used in queries, environment-derived config where feasible.
- Schemas live in `features/<module>/schemas/` and are shared by the React Hook Form
  resolver (client) and the server-side re-validation. One schema, two enforcement points.
- Normalize at the schema (e.g. `loginSchema` lowercases/trims email) so downstream code
  never re-normalizes.

## 6. Error Handling & Logging

- Let route-level boundaries (`app/error.tsx`) catch render failures; throw early rather
  than rendering broken states.
- Expected failures (bad credentials, missing permissions) are **returned or redirected**,
  never thrown as generic errors, and never leak whether an account exists.
- Log through `lib/logger` only — no bare `console.*` in application code (the logger's
  console transport is the sanctioned exception).
- Log context carries **IDs, never entities or secrets**:
  `logger.info("User signed in", { userId })` — not the user object, never a password or
  token.

## 7. Styling & UI

- **Design tokens only** (`bg-background`, `text-muted-foreground`, `border-border`).
  A hard-coded hex/oklch color in a component is a defect — it will break dark mode.
- New primitives come from shadcn (`npx shadcn@latest add <component>`) into
  `components/ui`; we own and may edit them, but keep edits minimal and documented.
- Compose classes with the `cn()` helper; class order is normalized by the Prettier
  Tailwind plugin — don't fight the formatter.
- **Mobile-first and responsive**: every screen must be usable at 375px, 768px, and
  desktop. The shell handles navigation; content must avoid fixed widths.
- Accessibility floor: semantic elements, `aria-label` on icon-only buttons,
  `aria-current` on active nav, `role="alert"` on error banners, `aria-hidden` on
  decorative icons. Keep to this baseline or better.

## 8. Formatting & Linting

- **Prettier is the formatter** (2-space indent, double quotes, 100-char width, Tailwind
  class sorting). Run `pnpm format`; never hand-format against it.
- **ESLint 9 flat config** extends `next/core-web-vitals`, `next/typescript`, and
  `prettier`. `pnpm lint` must be clean — warnings included.
- Pre-merge gate (manual until CI lands): `pnpm typecheck && pnpm lint && pnpm build`.

## 9. Database & Migrations

- Schema changes go through **migrations** (`pnpm db:migrate`), committed with the code
  that needs them. `db:push` is for local experiments only.
- Every foreign key gets an `@@index`. Every model gets `createdAt`/`updatedAt`.
- Choose `onDelete` behavior deliberately: `Restrict` for anything that anchors an audit
  trail, `SetNull` for optional associations, `Cascade` only for true ownership.
- The seed (`prisma/seed.ts`) must stay **idempotent** — upserts, never bare creates.

## 10. Comments & Documentation

- Comments explain **constraints and why**, not what the next line does. The
  edge-runtime warnings in `lib/auth/*` are the house style.
- Public-ish utilities and services get a short JSDoc block stating purpose and rules
  (see `services/user-service.ts`).
- If a change alters architecture, access control, or conventions, update the relevant
  doc in `docs/` **in the same change** — stale documentation is treated as a bug.

## 11. Git Hygiene

> Applies once the repository is under version control (M1 follow-up).

- Small, focused commits in imperative mood: `Add branch scoping to audit service`.
- Branch names: `feature/<module>-<slug>`, `fix/<slug>`, `docs/<slug>`.
- No secrets, `.env` files, or generated artifacts in commits — ever. `.gitignore`
  already covers the standard set; extend it rather than force-adding exceptions.
