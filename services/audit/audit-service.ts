import type {
  AuditRequestOptions,
  AuditStep,
  AuditSubmissionProgress,
  CreateSubmissionInput,
} from "@/services/audit/types";

/**
 * Audit engine interface (dependency inversion seam).
 *
 * Terminology follows docs/DOMAIN_MODEL.md (ADR-023): the aggregate root is
 * the AuditSubmission — a branch's logbook submission for one audit date.
 *
 * Pages, server actions, and future schedulers depend on this interface —
 * never on the engine's internals. The Milestone 2 implementation will
 * orchestrate the step pipeline (see `AUDIT_STEPS`), call the AI provider and
 * CRM connector through their own interfaces, enforce the aggregate
 * invariants (image limits, ordering, post-submit immutability), and publish
 * lifecycle events on the application event bus (`lib/events`).
 *
 * Designed for expansion:
 *  - new steps extend `AUDIT_STEPS` without changing these method signatures,
 *  - step outputs are opaque (`AuditStepResult.output`) at this level,
 *  - retry is a first-class operation rather than a hidden loop.
 */
export interface AuditService {
  /** Create a submission in DRAFT state (persists via the data layer). */
  createSubmission(
    input: CreateSubmissionInput,
    options?: AuditRequestOptions
  ): Promise<{ submissionId: string }>;

  /** Register a logbook image on a DRAFT submission (metadata only here). */
  attachImage(
    submissionId: string,
    image: { originalFileName: string; displayOrder: number },
    options?: AuditRequestOptions
  ): Promise<{ imageId: string }>;

  /** Freeze the draft and enter processing (DRAFT/UPLOADING → SUBMITTED). */
  submit(submissionId: string, options?: AuditRequestOptions): Promise<AuditSubmissionProgress>;

  /** Run the next pending step (or a specific step) of the pipeline. */
  executeStep(
    submissionId: string,
    step?: AuditStep,
    options?: AuditRequestOptions
  ): Promise<AuditSubmissionProgress>;

  /** Re-run a failed step; increments the attempt counter. */
  retryStep(
    submissionId: string,
    step: AuditStep,
    options?: AuditRequestOptions
  ): Promise<AuditSubmissionProgress>;

  /** Current pipeline state, for progress UIs and the dashboard. */
  getProgress(submissionId: string): Promise<AuditSubmissionProgress>;

  /**
   * Cancel a submission (terminal; only legal before OCR_PROCESSING —
   * DOMAIN_MODEL.md §5.1).
   */
  cancelSubmission(submissionId: string, reason?: string): Promise<void>;
}
