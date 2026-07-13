# Fermosa AI Platform

Internal enterprise web platform for AI-powered business modules. Version 1 focuses on the
**Audit** module; the foundation is designed to grow into Inventory, CRM, Sales, Marketing,
and Reporting.

**Milestone 1 (this codebase):** project foundation only — authentication, role-based
authorization, application shell (dashboard, sidebar, error pages), database schema, and
logging architecture. No audit business logic yet.

## Tech Stack

| Concern        | Technology                          |
| -------------- | ----------------------------------- |
| Framework      | Next.js 15 (App Router) + React 19  |
| Language       | TypeScript (strict)                 |
| Styling        | Tailwind CSS v4 + shadcn/ui         |
| Database       | PostgreSQL via Prisma ORM           |
| Authentication | Auth.js (NextAuth v5), JWT sessions |
| Validation     | Zod + React Hook Form               |
| Tooling        | pnpm, ESLint 9, Prettier            |

## Quick Start

### Prerequisites

- Node.js ≥ 20 (22 LTS recommended)
- pnpm ≥ 10 (`corepack enable pnpm`)
- PostgreSQL ≥ 14 running locally or reachable via `DATABASE_URL`

### Installation

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
#    Copy the example file and fill in DATABASE_URL and AUTH_SECRET
cp .env.example .env
#    Generate a secret: openssl rand -base64 32   (or: npx auth secret)

# 3. Create the database schema
pnpm db:migrate      # creates and applies migrations (dev)

# 4. Seed roles, branches, and demo users
pnpm db:seed

# 5. Run the dev server
pnpm dev             # http://localhost:3000
```

### Seeded accounts (development only)

| Role           | Email                   | Password       |
| -------------- | ----------------------- | -------------- |
| Super Admin    | `admin@fermosa.local`   | `ChangeMe@123` |
| Auditor        | `auditor@fermosa.local` | `ChangeMe@123` |
| Branch Manager | `manager@fermosa.local` | `ChangeMe@123` |

> Change or remove these accounts before deploying anywhere non-local.

## Scripts

| Command           | Purpose                          |
| ----------------- | -------------------------------- |
| `pnpm dev`        | Start the development server     |
| `pnpm build`      | Production build                 |
| `pnpm start`      | Serve the production build       |
| `pnpm lint`       | ESLint                           |
| `pnpm format`     | Prettier (write)                 |
| `pnpm typecheck`  | TypeScript, no emit              |
| `pnpm db:migrate` | Create/apply dev migrations      |
| `pnpm db:deploy`  | Apply migrations (CI/production) |
| `pnpm db:seed`    | Seed roles, branches, demo users |
| `pnpm db:studio`  | Prisma Studio (DB browser)       |

## Roles & Permissions

| Role           | Access                                     |
| -------------- | ------------------------------------------ |
| Super Admin    | Full access, including Users and Settings  |
| Auditor        | Dashboard, Audit, all Branches, Reports    |
| Branch Manager | Dashboard, Audit, only the assigned Branch |

Enforcement happens in three layers:

1. **Middleware** (`middleware.ts`) — redirects unauthenticated users to `/login`, blocks
   role-gated routes (`ROUTE_ACCESS` in `lib/auth/roles.ts`) with a redirect to `/forbidden`.
2. **Server guards** (`lib/auth/session.ts`) — `requireUser` / `requireRole` /
   `requirePermission` inside layouts and pages (defense in depth).
3. **UI** — the sidebar only shows items the current role may access
   (`lib/config/navigation.ts`).

## Documentation

Permanent project documentation lives in [docs/](docs/):

| Document                                        | Purpose                                                     |
| ----------------------------------------------- | ----------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)         | System design: layering, auth, RBAC, request lifecycles     |
| [PRODUCT.md](docs/PRODUCT.md)                   | Vision, users & roles, modules, scope, glossary             |
| [ROADMAP.md](docs/ROADMAP.md)                   | Milestone plan (M1 ✅ → M2 audit core → …)                  |
| [CODING_STANDARDS.md](docs/CODING_STANDARDS.md) | How code is written here (binding)                          |
| [DECISIONS.md](docs/DECISIONS.md)               | ADR log — why things are the way they are                   |
| [PROJECT_RULES.md](docs/PROJECT_RULES.md)       | Non-negotiable rules every change must satisfy              |
| [AI_RULES.md](docs/AI_RULES.md)                 | Binding rules for AI-assisted development                   |
| [VISION.md](docs/VISION.md)                     | Product vision: v1.0, user journeys, KPIs, success measures |
| [DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md)         | Authoritative business model for the Audit Module           |
| [DATABASE.md](docs/DATABASE.md)                 | Schema, ERD, and modeling rationale                         |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md)           | Setup and how-to guides (adding a module, authz cheatsheet) |
