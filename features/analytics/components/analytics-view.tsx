import { BarChart } from "@/components/charts/bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/features/dashboard/components/stat-tile";
import type { AnalyticsModel } from "@/services/analytics";

/**
 * Operational analytics view (M0055). Renders the model built from stored
 * snapshot records — dependency-free charts, honest empty states. No live CRM.
 */
export function AnalyticsView({ data }: { data: AnalyticsModel }) {
  if (data.snapshotCount === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <h2 className="text-lg font-medium">No analytics yet</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Analytics build from stored CRM evidence snapshots. Once audits seal snapshots, trends
            appear here — the live CRM is never queried.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pkg = data.packageCompletion;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile title="Snapshots" value={data.snapshotCount} hint="Stored evidence records" />
        <StatTile title="Patients" value={data.patientCount} hint="Distinct across snapshots" />
        <StatTile title="Revenue (paid)" value={`₱${data.totalRevenuePaid}`} />
        <StatTile
          title="Package completion"
          value={pkg.averagePercent === null ? null : `${pkg.averagePercent}%`}
          hint={`${pkg.completed} completed · ${pkg.inProgress} in progress`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top branches (by treatments)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={data.topBranches} ariaLabel="Treatment volume by branch" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Treatment frequency</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={data.treatmentFrequency} ariaLabel="Treatments by procedure" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue trend (paid per month)</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={data.revenueTrends}
              ariaLabel="Pesos paid per month"
              emptyLabel="No invoices yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staff activity (by treatments)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={data.staffActivity} ariaLabel="Treatments by staff" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staff by role</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={data.staffByRole}
              ariaLabel="Treatments by staff role"
              emptyLabel="No treatments yet."
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The CRM record carries only aesthetician / encoder / unknown — finer roles
              (salesperson, IV therapist) are not in the data and are bucketed as unknown.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit activity by target</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={data.editActivityByTarget} ariaLabel="Edit activity by target type" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branch comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Branch</th>
                  <th className="py-2 pr-4 text-right font-medium">Treatments</th>
                  <th className="py-2 text-right font-medium">Patients</th>
                </tr>
              </thead>
              <tbody>
                {data.branchComparison.map((row) => (
                  <tr key={row.branch} className="border-b last:border-0">
                    <td className="py-2 pr-4">{row.branch}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.treatments}</td>
                    <td className="py-2 text-right tabular-nums">{row.patients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
