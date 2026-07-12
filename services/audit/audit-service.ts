import type {
  AuditRequestOptions,
  AuditSessionProgress,
  AuditStep,
  StartAuditInput,
} from "@/services/audit/types";

/**
 * Audit engine interface (dependency inversion seam).
 *
 * Pages, server actions, and future schedulers depend on this interface —
 * never on the engine's internals. The Milestone 2 implementation will
 * orchestrate the step pipeline (see `AUDIT_STEPS`), call the AI provider and
 * CRM connector through their own interfaces, and publish lifecycle events on
 * the application event bus (`lib/events`) — this interface deliberately
 * exposes none of those internals.
 *
 * Designed for expansion:
 *  - new steps extend `AUDIT_STEPS` without changing these method signatures,
 *  - step outputs are opaque (`AuditStepResult.output`) at this level,
 *  - retry is a first-class operation rather than a hidden loop.
 */
export interface AuditService {
  /** Create a session in PENDING state (persists via the data layer). */
  startSession(
    input: StartAuditInput,
    options?: AuditRequestOptions
  ): Promise<{ sessionId: string }>;

  /** Associate an uploaded logbook with a session. */
  attachUpload(sessionId: string, uploadId: string, options?: AuditRequestOptions): Promise<void>;

  /** Run the next pending step (or a specific step) of the pipeline. */
  executeStep(
    sessionId: string,
    step?: AuditStep,
    options?: AuditRequestOptions
  ): Promise<AuditSessionProgress>;

  /** Re-run a failed step; increments the attempt counter. */
  retryStep(
    sessionId: string,
    step: AuditStep,
    options?: AuditRequestOptions
  ): Promise<AuditSessionProgress>;

  /** Current pipeline state, for progress UIs and the dashboard. */
  getProgress(sessionId: string): Promise<AuditSessionProgress>;

  /** Abort a session; releases any in-flight work and marks it CANCELLED. */
  cancelSession(sessionId: string, reason?: string): Promise<void>;
}
