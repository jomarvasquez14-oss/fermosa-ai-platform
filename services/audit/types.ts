/**
 * Audit pipeline types — superseded in Sprint 3.6 (ADR-029) by the
 * orchestrator's contracts, re-exported here so the seam's import path
 * stays stable for existing and future callers.
 */
export {
  AUDIT_PIPELINE,
  AUDIT_STAGE_LABELS,
  RUN_STATUSES,
  type AuditProgress,
  type AuditStageId,
  type AuditTransition,
  type RunStatus,
  type StageContext,
  type StageExecutor,
  type StageOutcome,
  type StageProgress,
} from "@/services/orchestrator/types";
