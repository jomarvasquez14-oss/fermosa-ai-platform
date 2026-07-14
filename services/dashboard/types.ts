import type { FindingSeverity, FindingStatus } from "@/lib/findings";

/**
 * Audit dashboard models (M0053). Three role-scoped views built by PURE
 * functions (`dashboard-builder.ts`) from rows already fetched by
 * `dashboard-service.ts`. No Prisma, no I/O here — deterministic and
 * unit-testable with seeded fixtures. Charts render from these numbers only;
 * there is no separate chart data source.
 */

/** Plain, DB-agnostic submission row (what the builders consume). */
export interface DashboardSubmissionRow {
  id: string;
  branchId: string;
  branchName: string;
  status: string;
  /** yyyy-mm-dd */
  auditDate: string;
  /** ISO or null */
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface DashboardFindingRow {
  id: string;
  submissionId: string;
  branchId: string;
  category: string;
  severity: FindingSeverity;
  status: FindingStatus;
  createdAt: string;
  reviewedAt: string | null;
  resolvedAt: string | null;
}

export interface DashboardBranchRow {
  id: string;
  name: string;
}

export interface DashboardInput {
  submissions: DashboardSubmissionRow[];
  findings: DashboardFindingRow[];
  branches: DashboardBranchRow[];
}

/** A labelled magnitude for the bar/trend charts. */
export interface ChartDatum {
  label: string;
  value: number;
}

export interface AuditorDashboard {
  role: "auditor";
  pendingAudits: number;
  completedAudits: number;
  criticalFindings: number;
  /** OPEN findings awaiting first review. */
  reviewQueue: number;
  averageReviewTimeHours: number | null;
  /** COMPLETED submissions per month (chronological). */
  monthlyVolume: ChartDatum[];
}

export interface BranchScoreHistoryPoint {
  /** yyyy-mm */
  month: string;
  complianceScore: number;
  audits: number;
}

export interface BranchDashboard {
  role: "branch";
  branchId: string;
  branchName: string;
  /** 0..100 — share of this branch's submissions that reached COMPLETED. */
  auditScore: number;
  /** 0..100 — 100 minus normalized open-finding risk. */
  complianceScore: number;
  openFindings: number;
  resolvedFindings: number;
  history: BranchScoreHistoryPoint[];
}

export interface BranchRankingRow {
  branchId: string;
  branchName: string;
  complianceScore: number;
  openFindings: number;
  completedAudits: number;
}

export interface AdminDashboard {
  role: "admin";
  branchRanking: BranchRankingRow[];
  /** Findings created per month (chronological). */
  findingTrends: ChartDatum[];
  /** Submissions created per month (chronological). */
  monthlyAuditVolume: ChartDatum[];
  /** Finding counts by category, most frequent first. */
  topRecurringIssues: ChartDatum[];
  averageAuditDurationHours: number | null;
}

export type Dashboard = AuditorDashboard | BranchDashboard | AdminDashboard;
