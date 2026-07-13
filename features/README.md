# Features

Each business module lives in its own folder and owns everything specific to it:

```
features/<module>/
├── actions/      # Server actions ("use server")
├── components/   # Module-specific React components
├── schemas/      # Zod validation schemas
├── data/         # Static/placeholder data (replaced by services later)
└── types.ts      # Module-specific types
```

Rules:

- A feature may import from `components/` (shared UI), `lib/`, `services/`, `utils/`, and `types/`.
- A feature must NOT import from another feature. Promote shared code to `components/shared`, `lib/`, or `services/` instead.
- Routes in `app/` stay thin: they compose feature components and enforce access via `lib/auth/session`.
- Cross-module reactions go through the event bus (`lib/events`), never through direct imports.
- **Module folders are created when work on the module begins** — no empty stubs
  (ADR-019). The roadmap, not the filesystem, records what's planned.

Current modules:

| Module      | Status                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| `auth`      | Implemented (login, sign-out)                                          |
| `dashboard` | Implemented (placeholder data)                                         |
| `audit`     | In progress — upload UI (2A.1) + submission persistence (2A.2) shipped |

Planned modules (see [docs/ROADMAP.md](../docs/ROADMAP.md)): audit (M2), reports, users,
settings, branches (M4), then CRM, inventory, sales, marketing, executive dashboard, HR,
accounting as scheduled.
