import { TrendChart } from "@/components/charts/trend-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BranchDashboard } from "@/services/dashboard";
import { StatTile } from "./stat-tile";

/**
 * Branch Manager dashboard (M0053): the branch's own audit and compliance
 * posture. Scoped to the manager's branch by the service. Real data only.
 */
export function BranchDashboardView({ data }: { data: BranchDashboard }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile title="Audit score" value={`${data.auditScore}%`} hint="Submissions reaching completion" />
        <StatTile title="Compliance score" value={`${data.complianceScore}%`} hint="100 − open-finding risk" />
        <StatTile title="Open findings" value={data.openFindings} />
        <StatTile title="Resolved findings" value={data.resolvedFindings} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance history</CardTitle>
        </CardHeader>
        <CardContent>
          {data.history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No audit history for {data.branchName} yet.
            </p>
          ) : (
            <>
              <TrendChart
                data={data.history.map((point) => ({
                  label: point.month,
                  value: point.complianceScore,
                }))}
                ariaLabel="Monthly compliance score"
              />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{data.history[0]!.month}</span>
                <span>{data.history[data.history.length - 1]!.month}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
