# Database

PostgreSQL, managed through Prisma. Schema: [`prisma/schema.prisma`](../prisma/schema.prisma).
The business meaning of the audit entities is defined in [DOMAIN_MODEL.md](DOMAIN_MODEL.md) —
this file covers the physical model only.

## Entity-Relationship Diagram

```mermaid
erDiagram
    Role ||--o{ User : "has many"
    Branch ||--o{ User : "assigned to"
    Branch ||--o{ AuditSubmission : "submits"
    User ||--o{ AuditSubmission : "submitted by"
    AuditSubmission ||--o{ LogbookImage : "owns (ordered)"
    AuditSubmission ||--o{ AuditFinding : "owns (canonical output)"
    AuditSubmission ||--o{ AuditTrailEntry : "records"
    AuditSubmission ||--o{ AuditEvidenceSnapshot : "owns (append-only evidence)"
    User ||--o{ AuditTrailEntry : "acted by"
    User ||--o{ SystemSetting : "last updated by"

    Role {
        string id PK
        enum name UK "SUPER_ADMIN | AUDITOR | BRANCH_MANAGER"
        string description
    }

    User {
        string id PK
        string full_name
        string email UK
        string password_hash
        enum status "ACTIVE | INACTIVE | SUSPENDED"
        string role_id FK
        string branch_id FK "nullable"
    }

    Branch {
        string id PK
        string name
        string code UK
        string address
        enum status "ACTIVE | INACTIVE"
    }

    AuditSubmission {
        string id PK
        enum status "DRAFT ... ARCHIVED | CANCELLED (DOMAIN_MODEL 5.1)"
        date audit_date "the date the pages cover"
        string branch_id FK "Restrict"
        string submitted_by_id FK "Restrict"
        string notes "nullable"
        datetime submitted_at "nullable"
        datetime completed_at "nullable"
    }

    LogbookImage {
        string id PK
        enum status "PENDING_UPLOAD | UPLOADING | STORED | UPLOAD_FAILED"
        string submission_id FK "Cascade (owned)"
        int display_order "1-based page order"
        int rotation "0 | 90 | 180 | 270 (viewing metadata)"
        string original_file_name
        string mime_type "nullable"
        int file_size_bytes "nullable"
        string storage_key "nullable until 2A.2 stores binaries"
        datetime uploaded_at "nullable"
        float ocr_confidence "nullable, written by M3"
    }

    AuditFinding {
        string id PK
        enum category "MISSING_IN_CRM | ... | OTHER (11 kinds)"
        enum severity "INFO | LOW | MEDIUM | HIGH | CRITICAL"
        enum status "OPEN | REVIEWED | RESOLVED"
        enum source "RULE_ENGINE | CRM_DISCOVERY | OCR | AI_ANALYSIS | MANUAL_REVIEW"
        string submission_id FK "Cascade (owned)"
        string title
        string detail
        string recommendation "nullable"
        string expected_value "nullable"
        string actual_value "nullable"
        json evidence "typed refs, IDs only"
        float confidence "nullable"
        datetime reviewed_at "nullable"
        datetime resolved_at "nullable"
        string resolution "nullable"
    }

    AuditTrailEntry {
        string id PK
        enum action "SUBMISSION_CREATED | DRAFT_SAVED | SUBMISSION_SUBMITTED | IMAGE_ADDED | IMAGE_REMOVED | IMAGE_REORDERED"
        string submission_id FK "Cascade (owned)"
        string actor_id FK "Restrict"
        json metadata "nullable, IDs only"
        datetime created_at
    }

    AuditEvidenceSnapshot {
        string id PK
        string submission_id FK "Cascade (owned)"
        string crm_patient_id "provenance string, NOT a FK"
        json record "full NormalizedCrmPatientRecord (ADR-027)"
        string content_hash "SHA-256, canonical sorted-key JSON"
        string connector_kind
        string selector_version
        datetime retrieved_at
        string window_from "nullable, yyyy-mm-dd"
        string window_to "nullable, yyyy-mm-dd"
        int snapshot_version "stored-format version"
        datetime created_at
    }

    SystemSetting {
        string id PK
        string key UK
        json value
        string description "nullable"
        string updated_by_id FK "nullable"
    }
```

All tables additionally carry `created_at` / `updated_at` (append-only tables —
`audit_trail_entries`, `audit_evidence_snapshots` — carry only `created_at`).

Future tables — `ocr_results`, `crm_comparisons`, `audit_reports` — are fully specified
in [DOMAIN_MODEL.md §3](DOMAIN_MODEL.md#3-entities) and are created when their milestone
ships (ADR-019: no speculative tables).

## Modeling Notes

- **IDs** are cuids (string PKs) — safe to expose in URLs, no enumeration risk.
- **`AuditSubmission` is the aggregate root** (ADR-023): `LogbookImage` rows are reached
  and mutated only through their submission. `onDelete: Cascade` on the image FK
  expresses true ownership; `onDelete: Restrict` on the submission's branch/user FKs
  protects the audit trail (ADR-010) — deactivate people and branches via `status`,
  never delete.
- **`audit_date` is a `DATE`**, not a timestamp: it names the calendar day the logbook
  pages cover, independent of when anyone uploaded them.
- **No unique constraint on `(branch_id, audit_date)`** — follow-up submissions for the
  same date are a legitimate business case (DOMAIN_MODEL.md §8, risk 2).
- **`display_order` has an index but no unique constraint**: reorder operations swap
  values transiently; contiguity (1..n) is a service-layer invariant.
- **`rotation` is viewing metadata** — the stored binary is never modified.
- **`storage_key` is nullable** and stores an object-storage key (S3/Azure Blob), never
  the binary — files don't belong in Postgres. Null until Sprint 2A.2 implements storage.
- **`User.branchId` is nullable**: Super Admins and Auditors are organization-wide;
  Branch Managers get an assigned branch. Enforced at the application layer.
- **`SystemSetting.value` is `Json`** so one table serves booleans, numbers, and
  structured config without migrations per setting.
- **`audit_evidence_snapshots` is append-only evidence, not a CRM mirror** (M0043,
  ADR-035): `crm_patient_id` is deliberately not a foreign key — no patient master
  table exists. The `record` jsonb is sealed by `content_hash` (canonical sorted-key
  SHA-256, because jsonb does not preserve key order) and re-verified on every load.
- **Naming**: tables and columns use `snake_case` via `@@map`/`@map`; Prisma models stay
  `camelCase`.

## Workflow

```bash
pnpm db:migrate    # create + apply a migration after editing schema.prisma (dev)
pnpm db:deploy     # apply pending migrations (CI/production)
pnpm db:seed       # idempotent seed (roles, branches, demo users, settings)
pnpm db:studio     # inspect data
```

- **`AuditTrailEntry` is append-only** (Sprint 2A.2): rows are never updated or deleted
  independently of their submission; `metadata` carries IDs and filenames, never blobs.

Applied migrations: `20260712221833_initial_schema`,
`20260712231752_audit_submission_domain_model` (replaced the M1 `AuditSession` /
`LogbookUpload` tables — both empty — with the ADR-023 model),
`20260713033923_audit_trail_entries` (Sprint 2A.2 audit trail),
`20260713163129_audit_findings` (Sprint 3.5 canonical findings, ADR-028 — rows are
never hard-deleted; false positives resolve with a note).
