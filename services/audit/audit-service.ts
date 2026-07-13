import type { AuditOrchestrator } from "@/services/orchestrator";

/**
 * Audit engine seam (ADR-015, realized in Sprint 3.6 by ADR-029).
 *
 * History: M1.1 sketched this interface with submission CRUD + a step
 * pipeline. Submission CRUD shipped separately in 2A.2
 * (`auditSubmissionService`), and the pipeline is now the orchestrator
 * (`services/orchestrator/`) — so the audit engine IS the orchestrator.
 * The alias keeps the seam name callers were promised; the contract is the
 * orchestrator's public API and is frozen from 3.6 (changes need an ADR).
 */
export type AuditService = AuditOrchestrator;
