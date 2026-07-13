/**
 * Findings kit (Sprint 3.5, ADR-028) — reusable components for the platform's
 * canonical output. Renders `FindingView`s from any source (DB rows later,
 * mock data today); owns no persistence.
 */
export * from "./types";
export {
  FindingCategoryBadge,
  FindingSeverityBadge,
  FindingSourceBadge,
  FindingStatusBadge,
} from "./finding-badges";
export { FindingCard } from "./finding-card";
export { FindingsList } from "./findings-list";
export { FindingsSummary, rollupFindings, sortFindings } from "./findings-summary";
export type { FindingsRollup } from "./findings-summary";
