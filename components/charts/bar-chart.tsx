import { cn } from "@/lib/utils";

/**
 * Hand-rolled horizontal bar chart (M0053) — no chart dependency. Pure CSS
 * bars: theme-aware (primary/muted tokens), responsive (flex), accessible
 * (a labelled list, each row stating its value). Renders from ChartDatum only.
 */

export interface BarChartDatum {
  label: string;
  value: number;
}

export function BarChart({
  data,
  ariaLabel,
  emptyLabel = "No data yet.",
  className,
  valueFormatter = (value) => `${value}`,
}: {
  data: BarChartDatum[];
  ariaLabel: string;
  emptyLabel?: string;
  className?: string;
  valueFormatter?: (value: number) => string;
}) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul aria-label={ariaLabel} className={cn("flex list-none flex-col gap-2 p-0", className)}>
      {data.map((datum) => (
        <li key={datum.label} className="flex items-center gap-3 text-sm">
          <span className="w-36 shrink-0 truncate text-muted-foreground" title={datum.label}>
            {datum.label}
          </span>
          <span
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${datum.label}: ${valueFormatter(datum.value)}`}
          >
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.round((datum.value / max) * 100)}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right tabular-nums">
            {valueFormatter(datum.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}
