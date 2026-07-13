"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  FindingCategoryBadge,
  FindingSeverityBadge,
  FindingSourceBadge,
  FindingStatusBadge,
} from "./finding-badges";
import { nextStatuses, type FindingStatus, type FindingView } from "./types";

interface FindingCardProps {
  finding: FindingView;
  expanded: boolean;
  onToggle: (id: string) => void;
  onStatusChange: (id: string, status: FindingStatus) => void;
}

const STATUS_ACTION_LABELS: Record<FindingStatus, string> = {
  OPEN: "Reopen",
  REVIEWED: "Mark reviewed",
  RESOLVED: "Resolve",
};

/**
 * One finding: collapsed row for scanning, expanded panel for inspection
 * (detail, expected vs actual, evidence references, recommendation, workflow).
 */
export function FindingCard({ finding, expanded, onToggle, onStatusChange }: FindingCardProps) {
  return (
    <Card className={cn("py-0", finding.severity === "CRITICAL" && "border-destructive/50")}>
      <CardContent className="p-0">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} finding: ${finding.title}`}
          onClick={() => onToggle(finding.id)}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-left hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <FindingSeverityBadge severity={finding.severity} />
          <span className="min-w-0 flex-1 font-medium">{finding.title}</span>
          <FindingCategoryBadge category={finding.category} />
          <FindingStatusBadge status={finding.status} />
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>

        {expanded && (
          <div className="flex flex-col gap-4 border-t px-4 py-4">
            <p className="max-w-prose text-sm">{finding.detail}</p>

            {(finding.expectedValue !== null || finding.actualValue !== null) && (
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground uppercase">Expected (CRM)</dt>
                  <dd className="text-sm font-medium">{finding.expectedValue ?? "—"}</dd>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground uppercase">Found (evidence)</dt>
                  <dd className="text-sm font-medium">{finding.actualValue ?? "—"}</dd>
                </div>
              </dl>
            )}

            <div>
              <h4 className="mb-1 text-xs font-medium text-muted-foreground uppercase">Evidence</h4>
              <ul className="m-0 list-none space-y-1 p-0 text-sm">
                {finding.evidence.map((item, index) => (
                  <li key={index} className="flex items-center gap-2">
                    {item.type === "logbook-field" && (
                      <>
                        <span>
                          Logbook page {item.pageNumber}, line {item.lineNumber}
                          {item.field ? ` — ${item.field}` : ""}
                        </span>
                        <Link
                          href={`/audit/${finding.submissionId}/review`}
                          className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                        >
                          open review <ExternalLink className="size-3" aria-hidden="true" />
                        </Link>
                      </>
                    )}
                    {item.type === "crm-record" && (
                      <span>
                        CRM record {item.refNo ? `${item.refNo} ` : ""}(patient {item.crmPatientId})
                        — {item.description}
                      </span>
                    )}
                    {item.type === "crm-activity" && (
                      <span>
                        CRM activity “{item.logName}” on{" "}
                        {new Date(item.occurredAt).toLocaleString()} (patient {item.crmPatientId})
                      </span>
                    )}
                    {item.type === "note" && <span>{item.text}</span>}
                  </li>
                ))}
              </ul>
            </div>

            {finding.recommendation && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase">
                  Recommendation
                </h4>
                <p className="mt-0.5 text-sm">{finding.recommendation}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {finding.branchName} · audit {finding.auditDate} ·{" "}
                <FindingSourceBadge source={finding.source} />
                {finding.confidence !== null && (
                  <span className="font-mono tabular-nums">
                    {" "}
                    · conf {finding.confidence.toFixed(2)}
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                {nextStatuses(finding.status).map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={status === "RESOLVED" ? "default" : "outline"}
                    onClick={() => onStatusChange(finding.id, status)}
                  >
                    {STATUS_ACTION_LABELS[status]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
