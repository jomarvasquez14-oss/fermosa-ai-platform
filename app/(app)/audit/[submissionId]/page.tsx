import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ScanSearch } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  SubmissionEditor,
  type EditorSubmission,
} from "@/features/audit/components/submission-editor";
import { SubmissionView } from "@/features/audit/components/submission-view";
import { hasPermission, ROLES } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";
import { formatDateOnly } from "@/utils/format";

export const metadata: Metadata = {
  title: "Submission",
};

export default async function SubmissionPage(props: { params: Promise<{ submissionId: string }> }) {
  const user = await requirePermission("audit:view");
  const { submissionId } = await props.params;
  const actor: Actor = { id: user.id, role: user.role, branchId: user.branchId ?? null };

  let submission;
  try {
    submission = await auditSubmissionService.get(actor, submissionId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const isDraft = submission.status === "DRAFT" || submission.status === "UPLOADING";
  const canEdit =
    isDraft &&
    hasPermission(user.role, "audit:upload") &&
    (user.role === ROLES.SUPER_ADMIN || user.branchId === submission.branchId);

  if (canEdit) {
    const editorSubmission: EditorSubmission = {
      id: submission.id,
      auditDate: submission.auditDate.toISOString().slice(0, 10),
      notes: submission.notes,
      images: submission.images.map((image) => ({
        id: image.id,
        fileName: image.originalFileName,
        sizeBytes: image.fileSizeBytes ?? 0,
        rotation: image.rotation,
        stored: image.status === "STORED",
      })),
    };
    return (
      <>
        <PageHeader
          title={`Draft — ${formatDateOnly(submission.auditDate)}`}
          description="Continue editing this draft. Images, order, and rotation are restored exactly as saved."
        />
        <SubmissionEditor submission={editorSubmission} />
      </>
    );
  }

  const canReview = !isDraft && hasPermission(user.role, "audit:manage");

  return (
    <>
      <PageHeader
        title={`Submission — ${formatDateOnly(submission.auditDate)}`}
        description={
          isDraft
            ? "Draft submission (read-only for your role)."
            : "Submitted evidence is read-only. Processing stages arrive in later sprints."
        }
      >
        {canReview && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="lg">
              <Link href={`/audit/${submission.id}/progress`}>
                <Activity aria-hidden="true" />
                Progress
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href={`/audit/${submission.id}/review`}>
                <ScanSearch aria-hidden="true" />
                Review OCR
              </Link>
            </Button>
          </div>
        )}
      </PageHeader>
      <SubmissionView submission={submission} actor={actor} />
    </>
  );
}
