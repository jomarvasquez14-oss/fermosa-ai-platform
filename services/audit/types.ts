/**
 * Audit pipeline contracts.
 * Architecture only (Milestone 1.1): the engine arrives in Milestone 2.
 */

/**
 * Ordered pipeline steps. Adding a future step means extending this list —
 * consumers must treat the set as open (switch statements over steps need a
 * default branch).
 */
export const AUDIT_STEPS = [
  "UPLOAD",
  "OCR",
  "VALIDATION",
  "CRM_RETRIEVAL",
  "MATCHING",
  "REVIEW",
  "CONFIRMATION",
  "REPORT_GENERATION",
  "NOTIFICATION",
] as const;

export type AuditStep = (typeof AUDIT_STEPS)[number];

export type AuditStepStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

export interface AuditStepResult {
  step: AuditStep;
  status: AuditStepStatus;
  startedAt?: Date;
  completedAt?: Date;
  /** How many times this step has been attempted (1 = first run). */
  attempt: number;
  error?: { code: string; message: string };
  /**
   * Step-specific output, typed by the step's own module once implemented
   * (e.g. OCR emits a LogbookExtraction reference). Kept opaque at the
   * pipeline level so new steps never change this contract.
   */
  output?: unknown;
}

/** Aggregate view of one audit session's progress through the pipeline. */
export interface AuditSessionProgress {
  sessionId: string;
  branchId: string;
  currentStep: AuditStep | null;
  steps: AuditStepResult[];
  isComplete: boolean;
}

export interface StartAuditInput {
  branchId: string;
  auditorId: string;
  scheduledFor?: Date;
  notes?: string;
}

export interface AuditRequestOptions {
  /** Correlates pipeline work with events and provider calls. */
  correlationId?: string;
}
