import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { AuditProgressScreen } from "@/features/audit/components/audit-progress-screen";
import { hasPermission } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { getAuditService } from "@/services/audit";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";
import { formatDateOnly } from "@/utils/format";

export const metadata: Metadata = {
  title: "Audit Progress",
};

export default async function AuditProgressPage(props: {
  params: Promise<{ submissionId: string }>;
}) {
  const user = await requirePermission("audit:view");
  const { submissionId } = await props.params;
  const actor: Actor = { id: user.id, role: user.role, branchId: user.branchId ?? null };

  let submission;
  let progress;
  try {
    submission = await auditSubmissionService.get(actor, submissionId);
    progress = await getAuditService().getLatestProgress(actor, submissionId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        title={`Audit progress — ${formatDateOnly(submission.auditDate)}`}
        description={`${submission.branch.name} · submission status: ${submission.status.toLowerCase().replaceAll("_", " ")}`}
      />
      <AuditProgressScreen
        submissionId={submissionId}
        progress={progress}
        canManage={hasPermission(user.role, "audit:manage")}
      />
    </>
  );
}
