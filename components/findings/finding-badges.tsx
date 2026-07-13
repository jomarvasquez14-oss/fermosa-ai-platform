import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FINDING_CATEGORY_LABELS,
  FINDING_SOURCE_LABELS,
  type FindingCategory,
  type FindingSeverity,
  type FindingSource,
  type FindingStatus,
} from "./types";

/** Severity chip — color encodes urgency so lists scan at a glance. */
export function FindingSeverityBadge({ severity }: { severity: FindingSeverity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase",
        severity === "CRITICAL" && "bg-destructive text-white",
        severity === "HIGH" && "bg-destructive/15 text-destructive",
        severity === "MEDIUM" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        severity === "LOW" && "bg-sky-500/15 text-sky-700 dark:text-sky-400",
        severity === "INFO" && "bg-muted text-muted-foreground"
      )}
    >
      {severity}
    </span>
  );
}

export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  return (
    <Badge
      variant={status === "OPEN" ? "destructive" : status === "REVIEWED" ? "secondary" : "default"}
      className={cn(status === "RESOLVED" && "bg-emerald-600 text-white")}
    >
      {status.toLowerCase()}
    </Badge>
  );
}

export function FindingCategoryBadge({ category }: { category: FindingCategory }) {
  return <Badge variant="outline">{FINDING_CATEGORY_LABELS[category]}</Badge>;
}

export function FindingSourceBadge({ source }: { source: FindingSource }) {
  return <span className="text-xs text-muted-foreground">via {FINDING_SOURCE_LABELS[source]}</span>;
}
