import "server-only";
import type { AuditRunStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { InvalidStateError, NotFoundError } from "@/lib/errors";
import { appEvents } from "@/lib/events";
import { logger } from "@/lib/logger";
import { runWithCorrelation, startSpan, trace } from "@/lib/telemetry";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";
import { assertTransition, isTerminal } from "./state-machine";
import {
  AUDIT_PIPELINE,
  type AuditProgress,
  type AuditStageId,
  type RunStatus,
  type StageExecutor,
  type StageProgress,
} from "./types";

/**
 * AuditOrchestrator (Sprint 3.6, ADR-029) — coordinates the audit lifecycle.
 *
 * Responsibilities: job/stage state (persisted — recovery derives from rows,
 * never memory), transition validation, submission-status mapping, event
 * emission, retry and cancellation. NOT responsibilities: OCR, CRM retrieval,
 * matching — those live in pluggable `StageExecutor`s.
 *
 * Authorization: read scoping is delegated to `auditSubmissionService.get`
 * (Branch Managers never see other branches); mutation rights are enforced
 * at the action layer (`audit:manage`).
 */

/** Submission status while a stage is active (DOMAIN_MODEL §5.1 mapping). */
const STAGE_SUBMISSION_STATUS: Record<
  AuditStageId,
  "OCR_PROCESSING" | "OCR_REVIEW" | "CRM_COMPARISON" | "REPORT_GENERATION"
> = {
  OCR: "OCR_PROCESSING",
  HUMAN_REVIEW: "OCR_REVIEW",
  CRM_RETRIEVAL: "CRM_COMPARISON",
  MATCHING: "CRM_COMPARISON",
  REPORT: "REPORT_GENERATION",
};

type JobWithStages = Prisma.AuditJobGetPayload<{ include: { stages: true } }>;

export class AuditOrchestrator {
  private readonly executors: Map<AuditStageId, StageExecutor>;

  constructor(executors: StageExecutor[]) {
    this.executors = new Map(executors.map((executor) => [executor.stage, executor]));
    for (const stage of AUDIT_PIPELINE) {
      if (!this.executors.has(stage)) {
        throw new InvalidStateError(`No executor registered for stage ${stage}.`);
      }
    }
  }

  /** Start a run for a SUBMITTED submission. One active job per submission. */
  async startAudit(actor: Actor, submissionId: string): Promise<AuditProgress> {
    const submission = await auditSubmissionService.get(actor, submissionId);
    if (submission.status === "DRAFT" || submission.status === "UPLOADING") {
      throw new InvalidStateError("Submit the submission before starting an audit run.");
    }

    const active = await prisma.auditJob.findFirst({
      where: { submissionId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    });
    if (active) {
      throw new InvalidStateError("An audit run is already in progress for this submission.");
    }

    const job = await prisma.auditJob.create({
      data: {
        submissionId,
        startedById: actor.id,
        status: "QUEUED",
        stages: { create: AUDIT_PIPELINE.map((stage) => ({ stage, status: "QUEUED" })) },
      },
      include: { stages: true },
    });

    await appEvents.publish("audit.started", {
      jobId: job.id,
      submissionId,
      branchId: submission.branchId,
    });
    logger.info("Audit run started", { jobId: job.id, submissionId, actorId: actor.id });

    await this.transitionJob(job.id, "QUEUED", "RUNNING");
    // Correlate everything this run does — stages, rules, log lines.
    return runWithCorrelation(job.id, () => this.runPipeline(actor, job.id));
  }

  /** Resume a WAITING stage (e.g. reviewer confirmed) and continue the run. */
  async completeWaitingStage(actor: Actor, jobId: string): Promise<AuditProgress> {
    const job = await this.getJobForActor(actor, jobId);
    const waiting = job.stages.find((stage) => stage.status === "WAITING");
    if (job.status !== "WAITING" || !waiting) {
      throw new InvalidStateError("This run is not waiting on anything.");
    }

    await this.transitionStage(waiting.id, "WAITING", "RUNNING");
    await this.completeStage(job.id, job.submissionId, waiting.stage as AuditStageId, waiting.id);
    await this.transitionJob(job.id, "WAITING", "RUNNING");
    return runWithCorrelation(job.id, () => this.runPipeline(actor, job.id));
  }

  /** Retry the failed stage of a FAILED run. */
  async retryStage(actor: Actor, jobId: string): Promise<AuditProgress> {
    const job = await this.getJobForActor(actor, jobId);
    const failed = job.stages.find((stage) => stage.status === "FAILED");
    if (job.status !== "FAILED" || !failed) {
      throw new InvalidStateError("This run has no failed stage to retry.");
    }

    await this.transitionStage(failed.id, "FAILED", "RETRYING");
    await this.transitionJob(job.id, "FAILED", "RETRYING");
    await this.transitionJob(job.id, "RETRYING", "RUNNING");
    return runWithCorrelation(job.id, () => this.runPipeline(actor, job.id));
  }

  /** Cancel a run. The submission itself is untouched — a new run can start. */
  async cancel(actor: Actor, jobId: string): Promise<AuditProgress> {
    const job = await this.getJobForActor(actor, jobId);
    if (isTerminal(job.status as RunStatus)) {
      throw new InvalidStateError("This run already finished.");
    }
    assertTransition({ from: job.status as RunStatus, to: "CANCELLED" });

    await prisma.$transaction([
      prisma.auditJob.update({
        where: { id: jobId },
        data: { status: "CANCELLED", completedAt: new Date(), currentStage: null },
      }),
      prisma.auditJobStage.updateMany({
        where: { jobId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        data: { status: "CANCELLED" },
      }),
    ]);
    await appEvents.publish("audit.cancelled", { jobId, submissionId: job.submissionId });
    return this.getProgress(actor, jobId);
  }

  /** Progress view for one job. */
  async getProgress(actor: Actor, jobId: string): Promise<AuditProgress> {
    const job = await this.getJobForActor(actor, jobId);
    return this.toProgress(job);
  }

  /** Latest job for a submission (or null) — what the progress page loads. */
  async getLatestProgress(actor: Actor, submissionId: string): Promise<AuditProgress | null> {
    await auditSubmissionService.get(actor, submissionId); // scoping
    const job = await prisma.auditJob.findFirst({
      where: { submissionId },
      orderBy: { startedAt: "desc" },
      include: { stages: true },
    });
    return job ? this.toProgress(job) : null;
  }

  // ---------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------

  /** Run stages in order until completed, waiting, failed, or cancelled. */
  private async runPipeline(actor: Actor, jobId: string): Promise<AuditProgress> {
    for (;;) {
      const job = await prisma.auditJob.findUniqueOrThrow({
        where: { id: jobId },
        include: { stages: true },
      });
      if (job.status === "CANCELLED") return this.toProgress(job);

      const next = AUDIT_PIPELINE.map((stage) =>
        job.stages.find((row) => row.stage === stage)
      ).find((row) => row && row.status !== "COMPLETED");

      if (!next) {
        await this.finishJob(job);
        return this.getProgress(actor, jobId);
      }

      const stageId = next.stage as AuditStageId;
      await this.transitionStage(next.id, next.status as RunStatus, "RUNNING", {
        attempt: { increment: 1 },
        startedAt: next.startedAt ?? new Date(),
        error: null,
        waitingReason: null,
      });
      await prisma.auditJob.update({ where: { id: jobId }, data: { currentStage: stageId } });
      await this.setSubmissionStatus(job.submissionId, STAGE_SUBMISSION_STATUS[stageId]);
      await appEvents.publish("audit.stage.started", {
        jobId,
        submissionId: job.submissionId,
        stage: stageId,
        attempt: next.attempt + 1,
      });

      try {
        // Stage timing: one span per executor attempt (4.0B).
        const outcome = await trace(
          "orchestrator.stage",
          { stage: stageId, jobId, submissionId: job.submissionId, attempt: next.attempt + 1 },
          async (span) => {
            const result = await this.executors.get(stageId)!.execute({
              jobId,
              submissionId: job.submissionId,
              stage: stageId,
              attempt: next.attempt + 1,
            });
            span.setAttribute("stageOutcome", result.kind);
            return result;
          }
        );

        if (outcome.kind === "waiting") {
          await this.transitionStage(next.id, "RUNNING", "WAITING", {
            waitingReason: outcome.reason,
          });
          await this.transitionJob(jobId, "RUNNING", "WAITING");
          return this.getProgress(actor, jobId);
        }

        await this.completeStage(jobId, job.submissionId, stageId, next.id);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.transitionStage(next.id, "RUNNING", "FAILED", { error: reason });
        await this.transitionJob(jobId, "RUNNING", "FAILED", { error: reason });
        await appEvents.publish("audit.stage.failed", {
          jobId,
          submissionId: job.submissionId,
          stage: stageId,
          reason,
        });
        await appEvents.publish("audit.failed", {
          submissionId: job.submissionId,
          branchId: (await auditSubmissionService.get(actor, job.submissionId)).branchId,
          step: stageId,
          reason,
        });
        logger.warn("Audit stage failed", { jobId, stage: stageId, reason });
        return this.getProgress(actor, jobId);
      }
    }
  }

  private async completeStage(
    jobId: string,
    submissionId: string,
    stage: AuditStageId,
    stageRowId: string
  ): Promise<void> {
    await prisma.auditJobStage.update({
      where: { id: stageRowId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await appEvents.publish("audit.stage.completed", { jobId, submissionId, stage });
  }

  private async finishJob(job: JobWithStages): Promise<void> {
    const span = startSpan("orchestrator.job.completed", {
      jobId: job.id,
      submissionId: job.submissionId,
      totalMs: Date.now() - job.startedAt.getTime(),
    });
    span.end();
    assertTransition({ from: job.status as RunStatus, to: "COMPLETED" });
    await prisma.auditJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", completedAt: new Date(), currentStage: null },
    });
    const submission = await prisma.auditSubmission.update({
      where: { id: job.submissionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await appEvents.publish("audit.completed", {
      submissionId: job.submissionId,
      branchId: submission.branchId,
    });
    logger.info("Audit run completed", { jobId: job.id, submissionId: job.submissionId });
  }

  private async setSubmissionStatus(
    submissionId: string,
    status: "OCR_PROCESSING" | "OCR_REVIEW" | "CRM_COMPARISON" | "REPORT_GENERATION"
  ): Promise<void> {
    await prisma.auditSubmission.update({ where: { id: submissionId }, data: { status } });
  }

  private async transitionJob(
    jobId: string,
    from: RunStatus,
    to: RunStatus,
    extra: Prisma.AuditJobUpdateInput = {}
  ): Promise<void> {
    assertTransition({ from, to });
    // Guarded update: the WHERE re-checks `from`, so concurrent transitions lose.
    const result = await prisma.auditJob.updateMany({
      where: { id: jobId, status: from as AuditRunStatus },
      data: { status: to as AuditRunStatus },
    });
    if (result.count === 0) {
      throw new InvalidStateError(`Run is no longer ${from}; refresh and try again.`);
    }
    if (Object.keys(extra).length > 0) {
      await prisma.auditJob.update({ where: { id: jobId }, data: extra });
    }
  }

  private async transitionStage(
    stageRowId: string,
    from: RunStatus,
    to: RunStatus,
    extra: Prisma.AuditJobStageUpdateInput = {}
  ): Promise<void> {
    assertTransition({ from, to });
    const result = await prisma.auditJobStage.updateMany({
      where: { id: stageRowId, status: from as AuditRunStatus },
      data: { status: to as AuditRunStatus },
    });
    if (result.count === 0) {
      throw new InvalidStateError(`Stage is no longer ${from}; refresh and try again.`);
    }
    if (Object.keys(extra).length > 0) {
      await prisma.auditJobStage.update({ where: { id: stageRowId }, data: extra });
    }
  }

  private async getJobForActor(actor: Actor, jobId: string): Promise<JobWithStages> {
    const job = await prisma.auditJob.findUnique({
      where: { id: jobId },
      include: { stages: true },
    });
    if (!job) throw new NotFoundError("Audit run");
    await auditSubmissionService.get(actor, job.submissionId); // 404s out-of-scope actors
    return job;
  }

  private toProgress(job: JobWithStages): AuditProgress {
    const ordered = AUDIT_PIPELINE.map((stage) => job.stages.find((row) => row.stage === stage)!);
    const stages: StageProgress[] = ordered.map((row) => ({
      stage: row.stage as AuditStageId,
      status: row.status as RunStatus,
      attempt: row.attempt,
      error: row.error,
      waitingReason: row.waitingReason,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
    }));

    const completed = stages.filter((stage) => stage.status === "COMPLETED");
    const durations = completed
      .filter((stage) => stage.startedAt && stage.completedAt)
      .map(
        (stage) => new Date(stage.completedAt!).getTime() - new Date(stage.startedAt!).getTime()
      );
    const avgDuration = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;
    const remaining = stages
      .filter((stage) => stage.status !== "COMPLETED" && stage.status !== "CANCELLED")
      .map((stage) => stage.stage);

    const endTime = job.completedAt?.getTime() ?? Date.now();

    return {
      jobId: job.id,
      submissionId: job.submissionId,
      status: job.status as RunStatus,
      currentStage: (job.currentStage as AuditStageId | null) ?? null,
      stages,
      completedStages: completed.map((stage) => stage.stage),
      remainingStages: remaining,
      percentage: Math.round((completed.length / AUDIT_PIPELINE.length) * 100),
      elapsedMs: endTime - job.startedAt.getTime(),
      estimatedRemainingMs:
        avgDuration !== null && remaining.length > 0
          ? Math.round(avgDuration * remaining.length)
          : null,
      startedAt: job.startedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    };
  }
}
