import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * One dashboard stat tile (M0053). Value + label + optional hint, matching the
 * house Card style. Empty/nullable values render as an honest em dash — never
 * a fabricated zero dressed up as data.
 */
export function StatTile({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number | null;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">
          {value === null ? "—" : value}
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
