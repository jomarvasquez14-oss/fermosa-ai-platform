import { Card, CardContent } from "@/components/ui/card";
import type { ReviewProgress } from "@/hooks/use-ocr-review";

/**
 * Review progress at a glance: pages confirmed and how fields were resolved.
 * Numbers come from the review hook — one source of truth.
 */
export function OCRSummary({ progress }: { progress: ReviewProgress }) {
  const stats = [
    { label: "Pages confirmed", value: `${progress.pagesConfirmed}/${progress.pagesTotal}` },
    { label: "Fields resolved", value: `${progress.fieldsResolved}/${progress.fieldsTotal}` },
    { label: "Auto-accepted", value: progress.autoAccepted },
    { label: "Edited", value: progress.edited },
    { label: "Unreadable", value: progress.unreadable },
    { label: "Awaiting decision", value: progress.pending },
  ] as const;

  return (
    <section
      aria-label="Review progress"
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
