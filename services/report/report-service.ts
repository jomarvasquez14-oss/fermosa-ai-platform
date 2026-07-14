import "server-only";
import type { Prisma } from "@prisma/client";
import { ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/services/audit-submission-service";
import { snapshotService } from "@/services/crm/snapshot";
import { findingService } from "@/services/finding-service";
import { buildReportModel, type ReportModel } from "./report-builder";

/**
 * Report persistence + orchestration (M0046). Reports are DERIVED, never
 * stored — every call rebuilds the model from the submission, its findings,
 * and its evidence snapshot metadata, all already at rest. No live CRM read
 * happens here.
 */

const submissionInclude = {
  branch: { select: { name: true } },
  submittedBy: { select: { fullName: true } },
} satisfies Prisma.AuditSubmissionInclude;

type ReportSubmissionRow = Prisma.AuditSubmissionGetPayload<{ include: typeof submissionInclude }>;

/** Branch scoping mirrors `findingService`'s pattern: BM = own branch, else unrestricted. */
function branchScope(actor: Actor): Prisma.AuditSubmissionWhereInput {
  return actor.role === ROLES.BRANCH_MANAGER ? { branchId: actor.branchId ?? "__none__" } : {};
}

async function getReadableSubmission(
  actor: Actor,
  submissionId: string
): Promise<ReportSubmissionRow> {
  const submission = await prisma.auditSubmission.findFirst({
    where: { id: submissionId, ...branchScope(actor) },
    include: submissionInclude,
  });
  if (!submission) throw new NotFoundError("Submission");
  return submission;
}

/** Assemble the report for a submission the actor may read (branch-scoped). */
export async function getReport(actor: Actor, submissionId: string): Promise<ReportModel> {
  const submission = await getReadableSubmission(actor, submissionId);

  const [findings, snapshots] = await Promise.all([
    findingService.listForSubmission(actor, submissionId),
    snapshotService.listForSubmission(submissionId),
  ]);

  return buildReportModel({
    submission: {
      id: submission.id,
      branchName: submission.branch.name,
      auditDate: submission.auditDate.toISOString().slice(0, 10),
      auditorName: submission.submittedBy.fullName,
      status: submission.status,
      submittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : null,
    },
    findings,
    snapshots,
    generatedAt: new Date().toISOString(),
  });
}
