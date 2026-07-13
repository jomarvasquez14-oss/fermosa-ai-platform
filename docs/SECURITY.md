# Security Review

> Sprint 4.0E (2026-07-14). Verified protections, known risks, and
> recommendations. Verification method: rule-by-rule code review + structural
> greps (guards on every page/action, Prisma confinement, public paths) +
> the browser-verified permission boundaries from each sprint's tests.

## Current protections (verified)

**Authentication**

- Auth.js v5 Credentials + bcrypt; non-`ACTIVE` users rejected in `authorize`;
  login errors never reveal account existence. JWT sessions, 8-hour lifetime,
  claims: `id`, `role`, `branchId` (ADR-005).
- Middleware covers everything except `PUBLIC_PATHS = /login, /unauthorized,
/forbidden` (verified — the list is exactly those three).

**Authorization / RBAC (four layers, verified)**

- Middleware `ROUTE_ACCESS` prefixes (incl. `/users`, `/settings`,
  `/playground`, `/dev`, `/findings`).
- Server guards on **every** page under `app/(app)/` (grep-verified; the one
  gap — the CRM placeholder page — was found and fixed in this review).
- Every server action re-derives the actor via `requirePermission` (grep-
  verified; the only exception is sign-out, which is safe unauthenticated).
- Service layer owns the invariants: branch scoping on submissions, images,
  findings, and jobs; out-of-scope reads return NOT_FOUND (existence never
  confirmed). Verified by integration tests (cross-branch invisibility,
  auditor read-only, BM denial at routes).

**Input validation**

- Zod on both sides of the wire (login, submission create/save); server
  actions re-parse — client validation is UX, not security (PROJECT_RULES 6).
- File uploads: type allow-list (JPG/PNG/HEIC) + 10 MB cap enforced client-
  side AND re-checked in the action; server-action body limit 12 MB caps the
  transport; stable server-generated IDs (filenames never trusted).
- AI output: schema-validated at the provider boundary; malformed output can
  not reach UIs. Finding evidence: schema-validated at the write boundary.

**Storage & data**

- Binaries in object storage only, opaque internal keys, **path-traversal
  rejected and tested**; image delivery only through an authenticated route
  scoped like submission reads, `Cache-Control: private`.
- Submitted evidence immutable (service-enforced + transaction-guarded double
  submit); findings never hard-deleted; audit trail append-only.
- PII: CRM reference captures and OCR samples are gitignored local-only;
  fixtures and docs use fictional data; raw images never logged.

**Secrets & environment**

- No secrets in the repo (`.env` gitignored; `.env.example` placeholders
  only); Zod-validated lazy server env (`lib/config/env.ts`); `server-only`
  markers keep node code out of client bundles; Prisma confined to
  `services/*` (grep-verified).
- `poweredByHeader` disabled. Server actions get Next's built-in origin
  checking (CSRF baseline).

## Known risks (accepted or open)

| Risk                                                                              | Severity                                   | Status                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| **No rate limiting / login throttling** — credentials endpoint is brute-forceable | High before any internet exposure          | Open (Continuous track; must land before non-VPN deployment)                     |
| **Seeded dev passwords + un-rotated `AUTH_SECRET`**                               | High if any shared environment reuses them | Open (M1 carry-over; rotate at first shared deploy)                              |
| JWT revocation is by expiry only; role changes need re-login                      | Medium                                     | Accepted (ADR-005; switch to DB sessions if instant revocation becomes required) |
| No security headers beyond defaults (CSP, HSTS, frame-ancestors)                  | Medium                                     | Open (add `headers()` in next.config at deploy hardening)                        |
| Auth.js v5 is beta                                                                | Medium                                     | Accepted (ADR-004; de-facto standard)                                            |
| Read access is not audit-trailed (only mutations)                                 | Low                                        | Accepted for v1; compliance call later                                           |
| Orphaned storage blobs after failed removals                                      | Low                                        | Accepted; sweep job when volumes grow                                            |
| Dev tools (`/playground`, `/dev/*`) exist in production builds                    | Low (SA-gated at 3 layers)                 | Accepted; consider build-time exclusion later                                    |

## Recommendations (ordered)

1. **Before any shared/internet deployment:** rate limiting + login attempt
   throttling; rotate `AUTH_SECRET` and all seeded credentials; add CSP/HSTS
   headers.
2. **With CRM automation:** dedicated read-only CRM service account (never a
   human's), credentials via env only, session cookies in memory only
   (framework already complies).
3. **With OCR integration:** confirm the Anthropic no-retention tier for
   patient-name PII before the first production image leaves the building
   (OCR_ARCHITECTURE §10 — still the open business/legal item).
4. **M4 (SSO):** replaces the credentials provider and retires the
   password-handling burden.
