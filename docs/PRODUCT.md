# Product

> Fermosa AI Platform — product definition and scope.
> Audience: everyone working on the platform (engineering, product, stakeholders).
> Related: [ROADMAP.md](ROADMAP.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

## 1. Vision

Fermosa AI Platform is an **internal enterprise web application** that consolidates the
organization's AI-assisted operations tooling into a single, role-governed platform.
Instead of one-off tools per department, every module — Audit, Inventory, CRM, Sales,
Marketing, Reporting — shares one login, one permission model, one design system, and one
database, so capabilities compound rather than fragment.

**Version 1 is the Audit module.** Everything else in this document describes the
platform's direction; only the foundation and the audit-module groundwork exist today.

## 2. Problem Statement

Branch operations produce paper logbooks that must be audited for compliance. Today that
process is manual: logbooks are reviewed by hand, findings live in spreadsheets, and
management has no consolidated, real-time view of compliance across branches. The audit
module digitizes this pipeline — branches upload logbook scans, auditors run structured
audit sessions against them, and management sees compliance posture on a dashboard.

## 3. Users & Roles

The platform has exactly three roles, enforced end-to-end (middleware, server guards,
data layer, UI):

| Role               | Who they are                                     | What they can do                                                                              |
| ------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Super Admin**    | Platform owners / IT administration              | Everything, including user administration and system settings                                 |
| **Auditor**        | Compliance staff working across the organization | View all branches, run audits, view reports                                                   |
| **Branch Manager** | Manager of a single branch location              | Operate strictly within the assigned branch (upload logbooks, view own branch's audit status) |

Role definitions and the full capability matrix live in
[`lib/auth/roles.ts`](../lib/auth/roles.ts) and are documented in
[ARCHITECTURE.md §5](ARCHITECTURE.md#5-authorization-rbac).

## 4. Platform Modules

| Module                | Purpose                                                                                                  | Status                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Dashboard**         | Cross-module overview: branch count, uploads, pending/completed audits, compliance rate, recent activity | Shell shipped (placeholder data)       |
| **Audit**             | Logbook upload intake, audit sessions, AI-assisted compliance checks                                     | Milestone 2 — data model shipped       |
| **Reports**           | Compliance summaries, branch comparisons, exports                                                        | Planned                                |
| **Branches**          | Branch directory and administration                                                                      | Planned (model + access rules shipped) |
| **Users**             | User administration: invitations, roles, branch assignment                                               | Planned (model + seed shipped)         |
| **Settings**          | System configuration backed by the `SystemSetting` store                                                 | Planned                                |
| **CRM**               | Customer accounts, interactions, pipeline                                                                | Future                                 |
| **Inventory**         | Stock tracking per branch                                                                                | Future                                 |
| **Sales / Marketing** | Direction only — not yet specified                                                                       | Future                                 |

## 5. What Exists Today (Milestone 1)

- Authentication (email + password, seeded accounts) with enforced login redirect.
- Three-role authorization at four layers (middleware, server guards, services, UI).
- Full application shell: responsive sidebar + topbar, breadcrumbs, user menu, dark mode,
  professional error pages (404/401/403/500).
- Complete database schema for User, Role, Branch, AuditSession, LogbookUpload,
  SystemSetting — relationships designed for the audit workflow before the workflow ships.
- Logging architecture, environment configuration, seed data, and this documentation set.

## 6. Explicit Non-Goals (current phase)

Deliberately **not** built yet, per project direction:

- OCR or any document-understanding pipeline
- AI/LLM features of any kind
- CRM integrations with external systems
- Browser automation
- The upload module and audit business logic (schema only)

Standing non-goals: the platform is **internal-only** — no public sign-up, no
self-service account creation, no multi-tenancy. Accounts are provisioned by a Super Admin.

## 7. Product Principles

1. **One platform, one experience.** Every module uses the shared shell, design tokens,
   and interaction patterns. A user who learns one module has learned them all.
2. **Least privilege by default.** New routes and data queries start locked down;
   access is granted through the central permission matrix, never ad hoc.
3. **Placeholder-honest.** Unbuilt functionality is shown as an explicit "under
   construction" state — never as broken or half-working UI.
4. **Enterprise longevity.** Choices favor maintainability over novelty; this codebase is
   expected to grow for years (see [PROJECT_RULES.md](PROJECT_RULES.md)).
5. **Audit trail sanctity.** Records that establish who-did-what (audit sessions, uploads)
   are never hard-deleted; users who own them cannot be deleted, only deactivated.

## 8. Success Measures

> To be validated with stakeholders — engineering placeholders until then.

- Time from logbook upload to completed audit (target: same business day).
- Percentage of branches covered by an audit each month.
- Compliance rate trend visible to management without manual report assembly.
- Zero cross-role data leaks (a Branch Manager can never observe another branch).

## 9. Glossary

| Term                | Meaning                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Branch**          | A physical business location, identified by a unique code (e.g. `MKT-001`)                                             |
| **Logbook Upload**  | A scanned logbook file submitted by a branch; stored in object storage, referenced by `storageKey`                     |
| **Audit Session**   | A structured review of a branch's logbooks by an auditor, with lifecycle `PENDING → IN_PROGRESS → COMPLETED/CANCELLED` |
| **Compliance Rate** | Share of audited items meeting policy (definition finalized in Milestone 2)                                            |
| **Module**          | A self-contained business capability under `features/` with its own routes, components, and services                   |
