import { BarChart } from "@/components/charts/bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuditorDashboard } from "@/services/dashboard";
import { StatTile } from "./stat-tile";

/**
 * Auditor dashboard (M0053): the review-oriented view — what is pending, what
 * is critical, and how the review queue is trending. Real data only.
 */
export function AuditorDashboardView({ data }: { data: AuditorDashboard }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile title="Pending audits" value={data.pendingAudits} hint="In progress, not yet completed" />
        <StatTile title="Completed audits" value={data.completedAudits} />
        <StatTile title="Critical findings" value={data.criticalFindings} hint="Unresolved" />
        <StatTile title="Review queue" value={data.reviewQueue} hint="Open findings awaiting review" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average review time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              {data.averageReviewTimeHours === null ? "—" : `${data.averageReviewTimeHours} h`}
            </div>
            <p className="text-xs text-muted-foreground">
              Mean hours from a finding being raised to first review.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Completed audits per month</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={data.monthlyVolume} ariaLabel="Completed audits per month" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
