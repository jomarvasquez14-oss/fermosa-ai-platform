/**
 * Confidence review bands (OCR_ARCHITECTURE.md §5).
 *
 * Thresholds are constants here until SystemSetting-backed configuration
 * lands with OCR integration — the kit reads them from one place only.
 */

export const AUTO_ACCEPT_THRESHOLD = 0.95;
export const REVIEW_THRESHOLD = 0.8;

export type ConfidenceBand = "auto" | "review" | "manual";

export function bandFor(confidence: number): ConfidenceBand {
  if (confidence >= AUTO_ACCEPT_THRESHOLD) return "auto";
  if (confidence >= REVIEW_THRESHOLD) return "review";
  return "manual";
}

export const BAND_LABELS: Record<ConfidenceBand, string> = {
  auto: "Auto-accepted",
  review: "Needs review",
  manual: "Manual confirmation",
};
