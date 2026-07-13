import { Badge } from "@/components/ui/badge";
import type { AuditSubmissionStatus } from "@/services/audit-submission-service";

const STATUS_LABELS: Record<AuditSubmissionStatus, string> = {
  DRAFT: "Draft",
  UPLOADING: "Uploading",
  SUBMITTED: "Submitted",
  OCR_PROCESSING: "OCR processing",
  OCR_REVIEW: "OCR review",
  CRM_COMPARISON: "CRM comparison",
  REPORT_GENERATION: "Generating report",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
  CANCELLED: "Cancelled",
};

/** Consistent status rendering for submissions across list and detail views. */
export function SubmissionStatusBadge({ status }: { status: AuditSubmissionStatus }) {
  const variant =
    status === "DRAFT" || status === "UPLOADING"
      ? ("secondary" as const)
      : status === "CANCELLED"
        ? ("outline" as const)
        : ("default" as const);
  return <Badge variant={variant}>{STATUS_LABELS[status]}</Badge>;
}
