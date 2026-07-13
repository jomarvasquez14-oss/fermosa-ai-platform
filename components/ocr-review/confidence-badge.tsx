import { cn } from "@/lib/utils";
import { bandFor } from "./confidence";

/**
 * Numeric confidence chip colored by review band (§5): green auto-accept,
 * amber needs-review, red manual. Shared by the review kit and the AI
 * Playground so band colors never drift.
 */
export function ConfidenceBadge({ value, className }: { value: number; className?: string }) {
  const band = bandFor(value);
  return (
    <span
      aria-label={`Confidence ${value.toFixed(2)}`}
      className={cn(
        "inline-block rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
        band === "auto" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        band === "review" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        band === "manual" && "bg-destructive/15 text-destructive",
        className
      )}
    >
      {value.toFixed(2)}
    </span>
  );
}
