# Services Layer

Two kinds of code live here, with different rules:

## 1. Data-access services (implementations)

`user-service.ts`, `branch-service.ts`, … — the **only** code in the application allowed
to import Prisma. They carry invariants every caller must inherit (e.g. branch scoping
for Branch Managers). Plain objects, no classes needed.

## 2. Capability abstractions (interfaces + factories)

`ai/`, `crm/`, `audit/` — dependency-inversion seams for capabilities whose
implementations are external, swappable, or not yet built:

| Folder   | Interface      | Strategies / implementations                             | Selected by                    |
| -------- | -------------- | -------------------------------------------------------- | ------------------------------ |
| `ai/`    | `AIProvider`   | openai-vision (M3), claude, gemini, azure-openai (later) | `AI_PROVIDER` env / argument   |
| `crm/`   | `CRMConnector` | browser-automation (M2+), api (future), mock (M2 tests)  | `CRM_CONNECTOR` env / argument |
| `audit/` | `AuditService` | audit engine (M2)                                        | `getAuditService()`            |

Rules:

- **Consumers import the interface and call the factory** (`getAIProvider()`,
  `getCRMConnector()`, `getAuditService()`). Nothing outside these folders may import a
  provider SDK, reference a connector kind, or branch on which implementation is active.
- **Implementations translate at the boundary**: provider/CRM-specific field names,
  errors, and artifacts never leak past the interface. Errors become `AppError`
  subclasses (`lib/errors.ts`).
- **Factories throw `NotImplementedError`** until an implementation lands — a loud
  failure beats a silent stub.
- When the first implementation of an interface lands, its contract is frozen: further
  changes require an ADR in [docs/DECISIONS.md](../docs/DECISIONS.md).

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) §Service Abstractions and
[docs/AI_RULES.md](../docs/AI_RULES.md).
