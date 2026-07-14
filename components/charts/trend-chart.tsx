import { cn } from "@/lib/utils";

/**
 * Hand-rolled sparkline / trend chart (M0053) — no chart dependency. A single
 * SVG polyline + area over a monthly series, theme-aware via `currentColor`
 * (the parent sets `text-primary`), responsive (viewBox + width 100%), and
 * accessible (role="img" with a text summary). Renders from ChartDatum only.
 */

export interface TrendPoint {
  label: string;
  value: number;
}

const WIDTH = 320;
const HEIGHT = 72;
const PAD = 4;

export function TrendChart({
  data,
  ariaLabel,
  emptyLabel = "No data yet.",
  className,
}: {
  data: TrendPoint[];
  ariaLabel: string;
  emptyLabel?: string;
  className?: string;
}) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? (WIDTH - PAD * 2) / (data.length - 1) : 0;
  const yOf = (value: number) => HEIGHT - PAD - (value / max) * (HEIGHT - PAD * 2);
  const points = data.map((d, i) => ({ x: PAD + i * stepX, y: yOf(d.value) }));

  // A single point renders as a flat baseline segment across the width.
  const line =
    points.length === 1
      ? `${PAD},${points[0]!.y} ${WIDTH - PAD},${points[0]!.y}`
      : points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints =
    points.length === 1
      ? `${PAD},${points[0]!.y} ${WIDTH - PAD},${points[0]!.y}`
      : points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${PAD},${HEIGHT - PAD} ${areaPoints} ${WIDTH - PAD},${HEIGHT - PAD}`;

  const summary = `${ariaLabel}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={cn("h-18 w-full text-primary", className)}
      role="img"
      aria-label={summary}
      preserveAspectRatio="none"
    >
      <polygon points={area} fill="currentColor" opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
