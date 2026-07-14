/**
 * Audit report generator (M0046).
 *
 * `report-builder.ts` — pure aggregation of stored evidence into `ReportModel`.
 * `report-html.ts`    — pure, deterministic, self-contained HTML renderer.
 * `report-service.ts` — Prisma reads + orchestration (branch-scoped).
 *
 * Reports are derived, never stored: every read rebuilds the model from the
 * submission + its findings + its evidence snapshot metadata, so a report is
 * always reproducible from what was already captured — no live CRM touch.
 */
export {
  buildReportModel,
  type BuildReportModelInput,
  type ReportModel,
} from "./report-builder";
export { renderReportHtml } from "./report-html";
export { getReport } from "./report-service";
