// @vitest-environment node
// Orchestrator integration tests against the local PostgreSQL database.
import "../../tests/helpers/load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { appEvents } from "@/lib/events";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";
import { AuditOrchestrator } from "./audit-orchestrator";
import { createMockExecutors } from "./executors/mock-executors";
import type { StageExecutor } from "./types";

const runId = `o${Date.now().toString(36)}`;
let branchId: string;
let manager: Actor;
let auditor: Actor;

/** Instant executors so the suite stays fast; HUMAN_REVIEW still waits. */
function instantExecutors(overrides: Partial<Record<string, StageExecutor>> = {}): StageExecutor[] {
  return createMockExecutors().map((executor) =>
    overrides[executor.stage]
      ? overrides[executor.stage]!
      : executor.stage === "HUMAN_REVIEW"
        ? executor
        : { stage: executor.stage, execute: async () => ({ kind: "completed" as const }) }
  );
}

async function submittedSubmission(): Promise<string> {
  const submission = await auditSubmissionService.createDraft(manager, {
    auditDate: new Date("2026-07-12T00:00:00Z"),
  });
  const image = await auditSubmissionService.addImage(manager, submission.id, {
    originalFileName: "page-1.png",
    fileSizeBytes: 2048,
  });
  await auditSubmissionService.markImageStored(manager, image.id, `test/${submission.id}/x`);
  await auditSubmissionService.submit(manager, submission.id);
  return submission.id;
}

beforeAll(async () => {
  const branch = await prisma.branch.create({
    data: { name: `Orch Branch ${runId}`, code: `OB-${runId}`, address: "test" },
  });
  branchId = branch.id;
  const role = await prisma.role.upsert({
    where: { name: "BRANCH_MANAGER" },
    update: {},
    create: { name: "BRANCH_MANAGER" },
  });
  const auditorRole = await prisma.role.upsert({
    where: { name: "AUDITOR" },
    update: {},
    create: { name: "AUDITOR" },
  });
  const managerUser = await prisma.user.create({
    data: {
      fullName: `Orch Manager ${runId}`,
      email: `orch.mgr.${runId}@test.local`,
      passwordHash: "x",
      roleId: role.id,
      branchId,
    },
  });
  const auditorUser = await prisma.user.create({
    data: {
      fullName: `Orch Auditor ${runId}`,
      email: `orch.aud.${runId}@test.local`,
      passwordHash: "x",
      roleId: auditorRole.id,
    },
  });
  manager = { id: managerUser.id, role: ROLES.BRANCH_MANAGER, branchId };
  auditor = { id: auditorUser.id, role: ROLES.AUDITOR, branchId: null };
}, 30000);

afterAll(async () => {
  await prisma.auditSubmission.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { email: { contains: `.${runId}@` } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
}, 30000);

describe("AuditOrchestrator", () => {
  it("runs the full pipeline: waits at human review, then completes, mapping submission status", async () => {
    const submissionId = await submittedSubmission();
    const orchestrator = new AuditOrchestrator(instantExecutors());

    const events: string[] = [];
    const unsubscribes = (
      ["audit.started", "audit.stage.started", "audit.stage.completed", "audit.completed"] as const
    ).map((name) => appEvents.subscribe(name, () => void events.push(name)));

    try {
      let progress = await orchestrator.startAudit(auditor, submissionId);
      expect(progress.status).toBe("WAITING");
      expect(progress.currentStage).toBe("HUMAN_REVIEW");
      expect(progress.completedStages).toEqual(["OCR"]);
      expect(progress.percentage).toBe(20);
      // Submission tracked the stage (§5.1 mapping).
      expect((await auditSubmissionService.get(auditor, submissionId)).status).toBe("OCR_REVIEW");

      progress = await orchestrator.completeWaitingStage(auditor, progress.jobId);
      expect(progress.status).toBe("COMPLETED");
      expect(progress.percentage).toBe(100);
      expect(progress.remainingStages).toEqual([]);
      expect(progress.completedAt).not.toBeNull();
      expect((await auditSubmissionService.get(auditor, submissionId)).status).toBe("COMPLETED");

      expect(events).toContain("audit.started");
      expect(events).toContain("audit.completed");
      expect(events.filter((name) => name === "audit.stage.completed").length).toBe(5);
    } finally {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    }
  }, 30000);

  it("records stage failure, supports retry, and finishes", async () => {
    const submissionId = await submittedSubmission();
    let failures = 0;
    const flaky: StageExecutor = {
      stage: "CRM_RETRIEVAL",
      async execute() {
        if (failures++ === 0) throw new AppError("CRM_UNAVAILABLE", "simulated outage");
        return { kind: "completed" };
      },
    };
    const orchestrator = new AuditOrchestrator(instantExecutors({ CRM_RETRIEVAL: flaky }));

    let progress = await orchestrator.startAudit(auditor, submissionId);
    progress = await orchestrator.completeWaitingStage(auditor, progress.jobId);
    expect(progress.status).toBe("FAILED");
    const failedStage = progress.stages.find((stage) => stage.stage === "CRM_RETRIEVAL")!;
    expect(failedStage.status).toBe("FAILED");
    expect(failedStage.error).toContain("simulated outage");

    progress = await orchestrator.retryStage(auditor, progress.jobId);
    expect(progress.status).toBe("COMPLETED");
    expect(progress.stages.find((stage) => stage.stage === "CRM_RETRIEVAL")!.attempt).toBe(2);
  }, 30000);

  it("cancels a waiting run; the submission survives and a new run can start", async () => {
    const submissionId = await submittedSubmission();
    const orchestrator = new AuditOrchestrator(instantExecutors());

    let progress = await orchestrator.startAudit(auditor, submissionId);
    progress = await orchestrator.cancel(auditor, progress.jobId);
    expect(progress.status).toBe("CANCELLED");
    expect(
      progress.stages
        .filter((stage) => stage.stage !== "OCR")
        .every((stage) => stage.status === "CANCELLED")
    ).toBe(true);

    // Terminal: no resume, no retry.
    await expect(orchestrator.completeWaitingStage(auditor, progress.jobId)).rejects.toThrow();
    await expect(orchestrator.retryStage(auditor, progress.jobId)).rejects.toThrow();

    // A fresh run is allowed.
    const fresh = await orchestrator.startAudit(auditor, submissionId);
    expect(fresh.status).toBe("WAITING");
    await orchestrator.cancel(auditor, fresh.jobId);
  }, 30000);

  it("refuses concurrent runs and runs on drafts", async () => {
    const submissionId = await submittedSubmission();
    const orchestrator = new AuditOrchestrator(instantExecutors());
    const progress = await orchestrator.startAudit(auditor, submissionId);
    await expect(orchestrator.startAudit(auditor, submissionId)).rejects.toThrow(
      /already in progress/
    );
    await orchestrator.cancel(auditor, progress.jobId);

    const draft = await auditSubmissionService.createDraft(manager, { auditDate: new Date() });
    await expect(orchestrator.startAudit(auditor, draft.id)).rejects.toThrow(/Submit the/);
  }, 30000);

  it("computes progress numbers from stage rows", async () => {
    const submissionId = await submittedSubmission();
    const orchestrator = new AuditOrchestrator(instantExecutors());
    const progress = await orchestrator.startAudit(auditor, submissionId);
    expect(progress.stages.map((stage) => stage.stage)).toEqual([
      "OCR",
      "HUMAN_REVIEW",
      "CRM_RETRIEVAL",
      "MATCHING",
      "REPORT",
    ]);
    expect(progress.remainingStages).toEqual([
      "HUMAN_REVIEW",
      "CRM_RETRIEVAL",
      "MATCHING",
      "REPORT",
    ]);
    expect(progress.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(progress.estimatedRemainingMs).not.toBeNull(); // one stage completed → estimable
    await orchestrator.cancel(auditor, progress.jobId);
  }, 30000);
});
