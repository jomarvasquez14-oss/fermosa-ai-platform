import Link from "next/link";
import { FileImage, Inbox } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SubmissionStatusBadge } from "@/features/audit/components/submission-status-badge";
import { requirePermission } from "@/lib/auth/session";
import { auditSubmissionService } from "@/services/audit-submission-service";
import { formatDateOnly, formatDateTime } from "@/utils/format";

/**
 * Scoped submission list (server component): Branch Managers see their
 * branch, Auditors and Super Admins see all — enforced by the service.
 */
export async function SubmissionList() {
  const user = await requirePermission("audit:view");
  const submissions = await auditSubmissionService.list({
    id: user.id,
    role: user.role,
    branchId: user.branchId ?? null,
  });

  if (submissions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-medium">No submissions yet</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Start a new upload to stage logbook images for an audit date.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul aria-label="Audit submissions" className="grid list-none gap-3 p-0">
      {submissions.map((submission) => (
        <li key={submission.id}>
          <Link
            href={`/audit/${submission.id}`}
            className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    Audit date {formatDateOnly(submission.auditDate)}
                    <span className="text-muted-foreground"> · {submission.branch.name}</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <FileImage className="size-4" aria-hidden="true" />
                    {submission.images.length} image{submission.images.length === 1 ? "" : "s"} ·
                    updated {formatDateTime(submission.updatedAt)}
                  </p>
                </div>
                <SubmissionStatusBadge status={submission.status} />
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
