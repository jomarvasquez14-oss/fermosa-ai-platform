import "server-only";
import type { Prisma } from "@prisma/client";
import { ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import type { Actor } from "@/services/audit-submission-service";
import { snapshotService } from "@/services/crm/snapshot";
import { findingService } from "@/services/finding-service";
import { getReport } from "@/services/report/report-service";
import { createRuleEngine } from "@/services/rules";
import { runPipeline, type PipelineContext, type StageRunner } from "./audit-pipeline";
import { nextRunAt } from "./schedule";
import type { PipelineStageId } from "./pipeline-stages";

/**
 * Scheduled audit pipeline persistence + composition (M0054, ADR-038).
 *
 * COMPOSES existing services — it does not reimplement them: the rule engine
 * (`createRuleEngine`), finding persistence (`findingService`), the report
 * generator (`getReport`), and the evidence snapshot service. Each run is
 * recorded as a `PipelineRun` row (per-stage results as JSON). OCR is a
 * disabled stage (skipped) until the OCR-integration phase supplies its runner.
 *
 * Pre-OCR honesty: with no confirmed logbook entries yet, the RULES stage
 * evaluates the real engine over an empty entry set (0 findings — correct), and
 * SNAPSHOT/DATASET report the current state rather than fabricating work. The
 * value here is the WIRING: cadence → run → per-stage record → OCR seam.
 */

/**
 * Default stage runners composing the real services for one submission.
 * Every runner returns a human detail string recorded on the PipelineRun.
 */
export function defaultRunners(
  actor: Actor,
  submissionId: string
): Partial<Record<PipelineStageId, StageRunner>> {
  return {
    SNAPSHOT: async () => {
      const snapshots = await snapshotService.listForSubmission(submissionId);
      return `${snapshots.length} evidence snapshot(s) on record`;
    },
    DATASET: async () => {
      // Datasets are produced by the explicit read-only sweep tool (M0050,
      // `pnpm dataset:crm`), not per-submission — recorded, not reinvented.
      return "dataset generation deferred to the M0050 sweep tool";
    },
    RULES: async (context: PipelineContext) => {
      const submission = await prisma.auditSubmission.findUniqueOrThrow({
        where: { id: submissionId },
        select: { id: true, branch: { select: { name: true } }, auditDate: true },
      });
      const report = createRuleEngine().evaluate({
        submission: {
          id: submission.id,
          branchName: submission.branch.name,
          auditDate: submission.auditDate.toISOString().slice(0, 10),
        },
        entries: [],
        resolutions: [],
        crmRecords: [],
      });
      context.artifacts.findings = report.findings;
      return `${report.results.length} rule result(s), ${report.findings.length} finding(s)`;
    },
    FINDINGS: async (context: PipelineContext) => {
      const findings = (context.artifacts.findings ?? []) as Parameters<
        typeof findingService.createForSubmission
      >[2];
      const { created, existing } = await findingService.createForSubmission(
        submissionId,
        "RULE_ENGINE",
        findings
      );
      return `${created} finding(s) persisted (${existing} already present)`;
    },
    REPORT: async () => {
      const report = await getReport(actor, submissionId);
      return `report built: ${report.findingSummary.total} finding(s), ${report.evidence.length} snapshot(s)`;
    },
    STORE: async () => "results stored on the pipeline run",
  };
}

function isPrivileged(actor: Actor): boolean {
  return actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.AUDITOR;
}

/**
 * Run the pipeline for one submission, recording a PipelineRun row. `runners`
 * is injectable for tests; production uses `defaultRunners`.
 */
export async function runSubmissionPipeline(
  actor: Actor,
  submissionId: string,
  options: {
    trigger?: "manual" | "schedule";
    scheduleId?: string | null;
    runners?: Partial<Record<PipelineStageId, StageRunner>>;
  } = {}
): Promise<{ runId: string; status: "COMPLETED" | "FAILED" }> {
  const trigger = options.trigger ?? "manual";
  const run = await prisma.pipelineRun.create({
    data: {
      status: "RUNNING",
      trigger,
      scheduleId: options.scheduleId ?? null,
      submissionId,
      stages: [],
    },
    select: { id: true },
  });

  const context: PipelineContext = { submissionId, artifacts: {} };
  const runners = options.runners ?? defaultRunners(actor, submissionId);
  const result = await runPipeline(context, runners);

  await prisma.pipelineRun.update({
    where: { id: run.id },
    data: {
      status: result.status,
      stages: result.stages as unknown as Prisma.InputJsonValue,
      error: result.error,
      finishedAt: new Date(),
    },
  });

  logger.info("Pipeline run finished", {
    runId: run.id,
    submissionId,
    trigger,
    status: result.status,
  });
  return { runId: run.id, status: result.status };
}

/**
 * Run every due schedule (cron/CLI entry). For each due, automatic schedule,
 * runs the pipeline for the most recent submission in its branch scope (if
 * any), then advances `lastRunAt`/`nextRunAt`. Returns a per-schedule summary.
 */
export async function runDueSchedules(
  actor: Actor,
  now: Date = new Date()
): Promise<Array<{ scheduleId: string; status: "COMPLETED" | "FAILED" | "SKIPPED" }>> {
  if (!isPrivileged(actor)) {
    throw new Error("runDueSchedules: only auditors/super-admins may run scheduled pipelines");
  }

  const schedules = await prisma.auditSchedule.findMany({
    where: { enabled: true, cadence: { not: "MANUAL" } },
    select: { id: true, cadence: true, branchId: true, nextRunAt: true },
  });

  const summary: Array<{ scheduleId: string; status: "COMPLETED" | "FAILED" | "SKIPPED" }> = [];
  for (const schedule of schedules) {
    const due = schedule.nextRunAt === null || schedule.nextRunAt.getTime() <= now.getTime();
    if (!due) continue;

    const submission = await prisma.auditSubmission.findFirst({
      where: schedule.branchId ? { branchId: schedule.branchId } : {},
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    let status: "COMPLETED" | "FAILED" | "SKIPPED" = "SKIPPED";
    if (submission) {
      const result = await runSubmissionPipeline(actor, submission.id, {
        trigger: "schedule",
        scheduleId: schedule.id,
      });
      status = result.status;
    }

    await prisma.auditSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: now, nextRunAt: nextRunAt(schedule.cadence, now) },
    });
    summary.push({ scheduleId: schedule.id, status });
  }
  return summary;
}
