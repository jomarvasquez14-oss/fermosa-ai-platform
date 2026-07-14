import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Inbox } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SubmissionStatusBadge } from "@/features/audit/components/submission-status-badge";
import { requirePermission } from "@/lib/auth/session";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";
import { formatDateOnly } from "@/utils/format";

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage() {
  const user = await requirePermission("reports:view");
  const actor: Actor = { id: user.id, role: user.role, branchId: user.branchId ?? null };
  const submissions = await auditSubmissionService.list(actor);

  return (
    <>
      <PageHeader title="Reports" description="Cross-branch audit and compliance reporting." />

      {submissions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-medium">No submissions yet</h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Reports become available once a branch has an audit submission.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul aria-label="Audit reports" className="grid list-none gap-3 p-0">
          {submissions.map((submission) => (
            <li key={submission.id}>
              <Link
                href={`/reports/${submission.id}`}
                className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">
                          Audit date {formatDateOnly(submission.auditDate)}
                          <span className="text-muted-foreground"> · {submission.branch.name}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Submitted by {submission.submittedBy.fullName}
                        </p>
                      </div>
                    </div>
                    <SubmissionStatusBadge status={submission.status} />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
