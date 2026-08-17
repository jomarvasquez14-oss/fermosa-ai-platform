import { BarChart } from "@/components/charts/bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminDashboard } from "@/services/dashboard";
import { StatTile } from "./stat-tile";

/**
 * Super-Admin dashboard (M0053): the cross-branch roll-up — ranking, trends,
 * volume, and recurring issues. Real data only; no live CRM.
 */
export function AdminDashboardView({ data }: { data: AdminDashboard }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          title="Average audit duration"
          value={data.averageAuditDurationHours === null ? null : `${data.averageAuditDurationHours} h`}
          hint="Mean hours from submission to completion"
        />
        <StatTile title="Branches" value={data.branchRanking.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branch ranking</CardTitle>
        </CardHeader>
        <CardContent>
          {data.branchRanking.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No branches yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Branch</th>
                    <th className="py-2 pr-4 text-right font-medium">Compliance</th>
                    <th className="py-2 pr-4 text-right font-medium">Open findings</th>
                    <th className="py-2 text-right font-medium">Completed audits</th>
                  </tr>
                </thead>
                <tbody>
                  {data.branchRanking.map((row) => (
                    <tr key={row.branchId} className="border-b last:border-0">
                      <td className="py-2 pr-4">{row.branchName}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.complianceScore}%</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.openFindings}</td>
                      <td className="py-2 text-right tabular-nums">{row.completedAudits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly audit volume</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={data.monthlyAuditVolume}
              ariaLabel="Monthly audit volume"
              emptyLabel="No submissions yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Finding trends</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={data.findingTrends} ariaLabel="Findings per month" emptyLabel="No findings yet." />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top recurring issues</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            data={data.topRecurringIssues.slice(0, 8)}
            ariaLabel="Top recurring finding categories"
            emptyLabel="No findings yet."
          />
        </CardContent>
      </Card>
    </div>
  );
}
