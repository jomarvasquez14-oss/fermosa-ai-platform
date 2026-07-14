/**
 * Audit dashboards (M0053) — public surface. Pure builders compute role-scoped
 * dashboard models from rows already at rest; the service does the Prisma reads
 * and role routing. Real data only — never the live CRM, never mock numbers.
 */
export {
  buildAdminDashboard,
  buildAuditorDashboard,
  buildBranchDashboard,
} from "./dashboard-builder";
export { getDashboard, getAdminDashboard } from "./dashboard-service";
export type {
  AdminDashboard,
  AuditorDashboard,
  BranchDashboard,
  BranchRankingRow,
  BranchScoreHistoryPoint,
  ChartDatum,
  Dashboard,
  DashboardBranchRow,
  DashboardFindingRow,
  DashboardInput,
  DashboardSubmissionRow,
} from "./types";
