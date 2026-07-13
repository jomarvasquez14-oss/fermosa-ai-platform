/**
 * Audit orchestration contracts (Sprint 3.6, ADR-029).
 *
 * The orchestrator coordinates the audit lifecycle — it never performs OCR,
 * CRM retrieval, or matching itself; stage executors do (mock executors
 * until their capabilities are integrated).
 */

/** Pipeline stages in execution order — the single source of stage order. */
export const AUDIT_PIPELINE = [
  "OCR",
  "HUMAN_REVIEW",
  "CRM_RETRIEVAL",
  "MATCHING",
  "REPORT",
] as const;
export type AuditStageId = (typeof AUDIT_PIPELINE)[number];

export const AUDIT_STAGE_LABELS: Record<AuditStageId, string> = {
  OCR: "OCR extraction",
  HUMAN_REVIEW: "Human review",
  CRM_RETRIEVAL: "CRM retrieval",
  MATCHING: "Matching",
  REPORT: "Report",
};

/** Run status for jobs and stages — one state machine governs both. */
export const RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "WAITING",
  "RETRYING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export interface AuditTransition {
  from: RunStatus;
  to: RunStatus;
}

/** Serializable view of one stage's execution state. */
export interface StageProgress {
  stage: AuditStageId;
  status: RunStatus;
  attempt: number;
  error: string | null;
  waitingReason: string | null;
  startedAt: string | null; // ISO
  completedAt: string | null; // ISO
}

/** Aggregate progress for one job (AuditProgress in the sprint spec). */
export interface AuditProgress {
  jobId: string;
  submissionId: string;
  status: RunStatus;
  currentStage: AuditStageId | null;
  stages: StageProgress[];
  completedStages: AuditStageId[];
  remainingStages: AuditStageId[];
  /** 0..100, completed stages over pipeline length. */
  percentage: number;
  elapsedMs: number;
  /** Average completed-stage duration × remaining count; null before data. */
  estimatedRemainingMs: number | null;
  startedAt: string; // ISO
  completedAt: string | null; // ISO
}

/**
 * What a stage executor reports back to the orchestrator:
 *  - "completed"  stage done, advance the pipeline
 *  - "waiting"    stage needs an external signal (e.g. human review)
 */
export type StageOutcome = { kind: "completed" } | { kind: "waiting"; reason: string };

export interface StageContext {
  jobId: string;
  submissionId: string;
  stage: AuditStageId;
  attempt: number;
}

/**
 * The pluggable unit of work. Real OCR/CRM/matching integrations replace the
 * mock executors WITHOUT touching the orchestrator (the whole point of 3.6).
 * Executors throw AppError subclasses on failure; the orchestrator records
 * the failure and owns retry.
 */
export interface StageExecutor {
  readonly stage: AuditStageId;
  execute(context: StageContext): Promise<StageOutcome>;
}
