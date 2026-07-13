import { Card, CardContent } from "@/components/ui/card";
import { SEVERITY_RANK, type FindingView } from "./types";

export interface FindingsRollup {
  total: number;
  open: number;
  reviewed: number;
  resolved: number;
  critical: number;
  high: number;
}

/** One pass over the list — the single source for every summary number. */
export function rollupFindings(findings: readonly FindingView[]): FindingsRollup {
  const rollup: FindingsRollup = {
    total: 0,
    open: 0,
    reviewed: 0,
    resolved: 0,
    critical: 0,
    high: 0,
  };
  for (const finding of findings) {
    rollup.total++;
    if (finding.status === "OPEN") rollup.open++;
    else if (finding.status === "REVIEWED") rollup.reviewed++;
    else rollup.resolved++;
    if (finding.severity === "CRITICAL") rollup.critical++;
    else if (finding.severity === "HIGH") rollup.high++;
  }
  return rollup;
}

/** Sort: most severe first, then newest. */
export function sortFindings(findings: readonly FindingView[]): FindingView[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.createdAt.localeCompare(a.createdAt)
  );
}

export function FindingsSummary({ rollup }: { rollup: FindingsRollup }) {
  const stats = [
    { label: "Total findings", value: rollup.total },
    { label: "Open", value: rollup.open },
    { label: "Reviewed", value: rollup.reviewed },
    { label: "Resolved", value: rollup.resolved },
    { label: "Critical", value: rollup.critical },
    { label: "High", value: rollup.high },
  ] as const;

  return (
    <section
      aria-label="Findings summary"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
    >
      {stats.map((stat) => (
        <Card key={stat.label} className="py-3">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground uppercase">{stat.label}</p>
            <p className="font-mono text-lg font-semibold tabular-nums">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
