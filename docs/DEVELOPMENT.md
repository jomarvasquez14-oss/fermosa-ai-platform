# Development Guide

## Environment

1. Node.js ≥ 20 and pnpm (`corepack enable pnpm`).
2. PostgreSQL running locally (or point `DATABASE_URL` at a dev server).
3. `cp .env.example .env`, set `DATABASE_URL` and `AUTH_SECRET`.
4. `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev`.

## Code Standards

- **TypeScript strict** (`noUncheckedIndexedAccess` enabled). No `any`; prefer narrowing.
- **Validation at every boundary** — all external input (forms, server actions, API routes)
  goes through a Zod schema. Schemas live in `features/<module>/schemas/` and are shared
  between client (React Hook Form resolver) and server.
- **Formatting/linting** — Prettier (with the Tailwind class sorter) and ESLint 9.
  Run `pnpm format && pnpm lint && pnpm typecheck` before committing.
- **Imports** use the `@/` alias, never relative traversal across top-level folders.

## Adding a New Module (e.g. Inventory)

1. **Schema** — add models to `prisma/schema.prisma`, run `pnpm db:migrate`.
2. **Service** — create `services/inventory-service.ts`; all Prisma access for the module
   lives here, including any role-scoping rules.
3. **Feature** — create `features/inventory/{components,actions,schemas}/`.
4. **Route** — add `app/(app)/inventory/page.tsx`; keep it thin (guard + compose).
5. **Access control** — if the module is role-restricted:
   - add a permission to `PERMISSIONS` and the matrix in `lib/auth/roles.ts`
   - add a `ROUTE_ACCESS` entry (middleware enforcement)
   - guard the page with `requirePermission(...)`
6. **Navigation** — add the item to `MAIN_NAV` in `lib/config/navigation.ts` (with `roles`
   if restricted).

## Authorization Cheatsheet

```ts
// In a server component / page:
const user = await requireUser(); // any authenticated user
const user = await requireRole(ROLES.SUPER_ADMIN); // specific role(s)
const user = await requirePermission("reports:view"); // capability check (preferred)

// Anywhere (client or server):
hasPermission(role, "branches:manage");
```

Prefer `requirePermission` — pages should ask for capabilities, not roles.

## Logging

```ts
import { logger } from "@/lib/logger";
logger.info("Audit session created", { sessionId, branchId });
logger.error("Upload failed", { uploadId, reason });
```

Never log secrets, passwords, or tokens. Context objects should carry IDs, not entities.

## UI Conventions

- Compose pages from `PageHeader` + feature components; placeholders use
  `ModulePlaceholder`.
- New primitives come from shadcn: `npx shadcn@latest add <component>`.
- Use design tokens (`bg-background`, `text-muted-foreground`, ...) — never hard-coded
  colors — so dark mode keeps working.
- Mobile-first: test at 375px (phone), 768px (tablet), and desktop widths.

## Verifying the UI in the in-app browser

The preview (in-app) browser paint-throttles pages whose pane is backgrounded
behind the chat — `document.visibilityState` reads `"hidden"` even for the
active tab. Tools that need the compositor (`computer` screenshot/click/type,
`read_page`) then time out or return empty, while DOM-level tools keep working.
Verify UI like this:

- **Log in:** seeded accounts (password `ChangeMe@123`): `admin@fermosa.local`
  (SUPER_ADMIN), `auditor@fermosa.local` (AUDITOR), `manager@fermosa.local`
  (BRANCH_MANAGER, Makati). The Auth.js credentials flow works in-browser.
- **Check content (works even when backgrounded):** `navigate` to the route,
  then `get_page_text` for rendered content and `javascript_tool` for computed
  styles / element state.
- **Screenshots:** focus/open the Browser pane first — that flips the page to
  `visible` and paint resumes. No tool flips pane-level visibility.

This is an environment limitation of the preview browser, not an app or auth
defect (see `docs/MILESTONES/M0057.md`). The Playwright CRM connector is
unaffected — it runs its own headless Chromium.
