# Database

PostgreSQL, managed through Prisma. Schema: [`prisma/schema.prisma`](../prisma/schema.prisma).

## Entity-Relationship Diagram

```mermaid
erDiagram
    Role ||--o{ User : "has many"
    Branch ||--o{ User : "assigned to"
    Branch ||--o{ AuditSession : "audited in"
    Branch ||--o{ LogbookUpload : "receives"
    User ||--o{ AuditSession : "conducts (auditor)"
    User ||--o{ LogbookUpload : "uploads"
    User ||--o{ SystemSetting : "last updated by"
    AuditSession ||--o{ LogbookUpload : "contains"

    Role {
        string id PK
        enum name UK "SUPER_ADMIN | AUDITOR | BRANCH_MANAGER"
        string description
        datetime created_at
        datetime updated_at
    }

    User {
        string id PK
        string full_name
        string email UK
        string password_hash
        enum status "ACTIVE | INACTIVE | SUSPENDED"
        string role_id FK
        string branch_id FK "nullable"
        datetime created_at
        datetime updated_at
    }

    Branch {
        string id PK
        string name
        string code UK
        string address
        enum status "ACTIVE | INACTIVE"
        datetime created_at
        datetime updated_at
    }

    AuditSession {
        string id PK
        enum status "PENDING | IN_PROGRESS | COMPLETED | CANCELLED"
        string notes "nullable"
        string branch_id FK
        string auditor_id FK
        datetime scheduled_for "nullable"
        datetime started_at "nullable"
        datetime completed_at "nullable"
        datetime created_at
        datetime updated_at
    }

    LogbookUpload {
        string id PK
        string file_name
        string storage_key
        string mime_type "nullable"
        int file_size "nullable"
        enum status "PENDING | PROCESSING | PROCESSED | FAILED"
        string branch_id FK
        string uploaded_by_id FK
        string audit_session_id FK "nullable"
        datetime created_at
        datetime updated_at
    }

    SystemSetting {
        string id PK
        string key UK
        json value
        string description "nullable"
        string updated_by_id FK "nullable"
        datetime created_at
        datetime updated_at
    }
```

## Modeling Notes

- **IDs** are cuids (string PKs) — safe to expose in URLs, no enumeration risk.
- **`User.branchId` is nullable**: Super Admins and Auditors are organization-wide;
  Branch Managers get an assigned branch. Enforced at the application layer.
- **`LogbookUpload.auditSessionId` is nullable**: logbooks can be uploaded ahead of an
  audit session and attached later (Milestone 2 decides the exact flow).
- **`LogbookUpload.storageKey`** stores an object-storage key (S3/Azure Blob), never the
  binary — files don't belong in Postgres.
- **`SystemSetting.value` is `Json`** so one table serves booleans, numbers, and structured
  config without migrations per setting.
- **Delete behavior**: users cannot be hard-deleted while they own audit sessions/uploads
  (`onDelete: Restrict`) — audit trails must survive. Branch deletion cascades its sessions
  and uploads; deactivate branches (status) instead of deleting them in practice.
- **Naming**: tables and columns use `snake_case` via `@@map`/`@map`; Prisma models stay
  `camelCase`.

## Workflow

```bash
pnpm db:migrate    # create + apply a migration after editing schema.prisma (dev)
pnpm db:deploy     # apply pending migrations (CI/production)
pnpm db:seed       # idempotent seed (roles, branches, demo users, settings)
pnpm db:studio     # inspect data
```
