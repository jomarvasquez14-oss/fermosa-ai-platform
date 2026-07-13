import { History, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmissionStatusBadge } from "@/features/audit/components/submission-status-badge";
import { cn } from "@/lib/utils";
import type { Actor, SubmissionWithImages } from "@/services/audit-submission-service";
import { auditSubmissionService } from "@/services/audit-submission-service";
import { formatDateOnly, formatDateTime, formatFileSize } from "@/utils/format";

const TRAIL_LABELS: Record<string, string> = {
  SUBMISSION_CREATED: "Submission created",
  DRAFT_SAVED: "Draft saved",
  SUBMISSION_SUBMITTED: "Submitted",
  IMAGE_ADDED: "Image added",
  IMAGE_REMOVED: "Image removed",
  IMAGE_REORDERED: "Images reordered",
};

/**
 * Read-only submission view (server component) — used for SUBMITTED and later
 * states, and for read-only roles. Submitted evidence is never editable.
 */
export async function SubmissionView({
  submission,
  actor,
}: {
  submission: SubmissionWithImages;
  actor: Actor;
}) {
  const trail = await auditSubmissionService.getTrail(actor, submission.id);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Audit date</dt>
              <dd className="font-medium">{formatDateOnly(submission.auditDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Branch</dt>
              <dd className="font-medium">
                {submission.branch.name} ({submission.branch.code})
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Submitted by</dt>
              <dd className="font-medium">{submission.submittedBy.fullName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {submission.submittedAt ? "Submitted at" : "Last updated"}
              </dt>
              <dd className="font-medium">
                {formatDateTime(submission.submittedAt ?? submission.updatedAt)}
              </dd>
            </div>
          </dl>
          <SubmissionStatusBadge status={submission.status} />
        </CardContent>
      </Card>

      <section aria-label="Logbook images">
        <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {submission.images.map((image, index) => (
            <li key={image.id}>
              <Card className="gap-0 overflow-hidden p-0">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  {image.status === "STORED" ? (
                    // Access-controlled blob served by /api/images — not optimizable.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/images/${image.id}`}
                      alt={`Logbook page ${index + 1}: ${image.originalFileName}`}
                      className={cn(
                        "size-full object-contain",
                        image.rotation === 90 && "rotate-90",
                        image.rotation === 180 && "rotate-180",
                        image.rotation === 270 && "-rotate-90"
                      )}
                    />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <ImageOff className="size-8" aria-hidden="true" />
                      <span className="px-2 text-xs">Image not stored</span>
                    </span>
                  )}
                  <Badge variant="secondary" className="absolute top-2 left-2 shadow-sm">
                    Page {index + 1}
                  </Badge>
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium" title={image.originalFileName}>
                    {image.originalFileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {image.fileSizeBytes ? formatFileSize(image.fileSizeBytes) : "—"}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" aria-hidden="true" />
            Audit trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-none space-y-2 p-0 text-sm">
            {trail.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="font-medium">{TRAIL_LABELS[entry.action] ?? entry.action}</span>
                  <span className="text-muted-foreground"> — {entry.actor.fullName}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
