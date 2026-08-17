/**
 * Operational analytics (M0055) — public surface. A pure builder aggregates
 * stored evidence snapshot records; the service reads them (never the live
 * CRM). Input is history the platform already sealed (ADR-035).
 */
export { buildAnalytics } from "./analytics-builder";
export { getAnalytics } from "./analytics-service";
export type { AnalyticsDatum, AnalyticsModel, BranchComparisonRow } from "./types";
