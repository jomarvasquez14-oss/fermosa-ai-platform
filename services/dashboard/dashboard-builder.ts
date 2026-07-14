import type { FindingSeverity } from "@/lib/findings";
import type {
  AdminDashboard,
  AuditorDashboard,
  BranchDashboard,
  BranchRankingRow,
  BranchScoreHistoryPoint,
  ChartDatum,
  DashboardFindingRow,
  DashboardInput,
  DashboardSubmissionRow,
} from "./types";

/**
 * Pure dashboard builders (M0053). Deterministic aggregation over already-
 * fetched rows — no Prisma, no Date.now(), no I/O. Same rows in → same model
 * out, so every number is unit-testable and every chart renders from these
 * values alone.
 *
 * Scoring (documented, deterministic — see docs/MILESTONES/M0053.md):
 *  - severity risk weights mirror the rule engine's defaults.
 *  - complianceScore = clamp(100 − openRiskPoints, 0, 100), where openRiskPoints
 *    is the severity-weighted count of OPEN findings, normalized per completed
 *    audit so a busy branch is not punished for volume.
 *  - auditScore = share of a branch's submissions that reached COMPLETED.
 */

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 3,
  HIGH: 7,
  CRITICAL: 15,
};

const COMPLETED = "COMPLETED";
/** Submission statuses that count as "in flight" (not a terminal state). */
const TERMINAL = new Set([COMPLETED, "ARCHIVED", "CANCELLED"]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** yyyy-mm from an ISO/date string. */
function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function hoursBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000;
}

/** Mean of a numeric series, or null when empty. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** Chronological month buckets of counts over a set of ISO timestamps. */
function monthlyCounts(timestamps: string[]): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const iso of timestamps) {
    const month = monthOf(iso);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([label, value]) => ({ label, value }));
}

function openRiskPoints(findings: DashboardFindingRow[]): number {
  return findings
    .filter((f) => f.status === "OPEN")
    .reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
}

/**
 * Compliance score for a branch: 100 minus open-finding risk normalized per
 * completed audit (so 3 open MEDIUMs across 10 audits scores far better than
 * across 1). Branches with no completed audits and no open findings score 100
 * (nothing wrong yet); with open findings but no completed audits, the raw risk
 * applies (can't normalize by zero).
 */
function complianceScore(findings: DashboardFindingRow[], completedAudits: number): number {
  const risk = openRiskPoints(findings);
  if (risk === 0) return 100;
  const normalized = completedAudits > 0 ? risk / completedAudits : risk;
  return clamp(round1(100 - normalized), 0, 100);
}

function auditScore(submissions: DashboardSubmissionRow[]): number {
  if (submissions.length === 0) return 100;
  const completed = submissions.filter((s) => s.status === COMPLETED).length;
  return round1((completed / submissions.length) * 100);
}

export function buildAuditorDashboard(input: DashboardInput): AuditorDashboard {
  const { submissions, findings } = input;
  const completed = submissions.filter((s) => s.status === COMPLETED);
  const pending = submissions.filter((s) => !TERMINAL.has(s.status) && s.status !== "DRAFT");

  const reviewTimes = findings
    .filter((f) => f.reviewedAt !== null)
    .map((f) => hoursBetween(f.createdAt, f.reviewedAt!))
    .filter((h) => h >= 0);

  return {
    role: "auditor",
    pendingAudits: pending.length,
    completedAudits: completed.length,
    criticalFindings: findings.filter((f) => f.severity === "CRITICAL" && f.status !== "RESOLVED")
      .length,
    reviewQueue: findings.filter((f) => f.status === "OPEN").length,
    averageReviewTimeHours: mean(reviewTimes),
    monthlyVolume: monthlyCounts(completed.filter((s) => s.completedAt).map((s) => s.completedAt!)),
  };
}

export function buildBranchDashboard(
  input: DashboardInput,
  branchId: string,
  branchName: string
): BranchDashboard {
  const submissions = input.submissions.filter((s) => s.branchId === branchId);
  const findings = input.findings.filter((f) => f.branchId === branchId);
  const completedAudits = submissions.filter((s) => s.status === COMPLETED).length;

  // Per-month compliance history, oldest first.
  const byMonth = new Map<string, { findings: DashboardFindingRow[]; audits: number }>();
  for (const submission of submissions) {
    const month = monthOf(submission.auditDate);
    const bucket = byMonth.get(month) ?? { findings: [], audits: 0 };
    if (submission.status === COMPLETED) bucket.audits += 1;
    byMonth.set(month, bucket);
  }
  for (const finding of findings) {
    const submission = submissions.find((s) => s.id === finding.submissionId);
    if (!submission) continue;
    const month = monthOf(submission.auditDate);
    const bucket = byMonth.get(month) ?? { findings: [], audits: 0 };
    bucket.findings.push(finding);
    byMonth.set(month, bucket);
  }
  const history: BranchScoreHistoryPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, bucket]) => ({
      month,
      complianceScore: complianceScore(bucket.findings, bucket.audits),
      audits: bucket.audits,
    }));

  return {
    role: "branch",
    branchId,
    branchName,
    auditScore: auditScore(submissions),
    complianceScore: complianceScore(findings, completedAudits),
    openFindings: findings.filter((f) => f.status === "OPEN").length,
    resolvedFindings: findings.filter((f) => f.status === "RESOLVED").length,
    history,
  };
}

export function buildAdminDashboard(input: DashboardInput): AdminDashboard {
  const { submissions, findings, branches } = input;

  const branchRanking: BranchRankingRow[] = branches
    .map((branch) => {
      const branchSubs = submissions.filter((s) => s.branchId === branch.id);
      const branchFindings = findings.filter((f) => f.branchId === branch.id);
      const completedAudits = branchSubs.filter((s) => s.status === COMPLETED).length;
      return {
        branchId: branch.id,
        branchName: branch.name,
        complianceScore: complianceScore(branchFindings, completedAudits),
        openFindings: branchFindings.filter((f) => f.status === "OPEN").length,
        completedAudits,
      };
    })
    // Highest compliance first; ties broken by fewer open findings, then name.
    .sort(
      (a, b) =>
        b.complianceScore - a.complianceScore ||
        a.openFindings - b.openFindings ||
        (a.branchName < b.branchName ? -1 : 1)
    );

  const categoryCounts = new Map<string, number>();
  for (const finding of findings) {
    categoryCounts.set(finding.category, (categoryCounts.get(finding.category) ?? 0) + 1);
  }
  const topRecurringIssues: ChartDatum[] = [...categoryCounts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : 1));

  const auditDurations = submissions
    .filter((s) => s.submittedAt && s.completedAt)
    .map((s) => hoursBetween(s.submittedAt!, s.completedAt!))
    .filter((h) => h >= 0);

  return {
    role: "admin",
    branchRanking,
    findingTrends: monthlyCounts(findings.map((f) => f.createdAt)),
    monthlyAuditVolume: monthlyCounts(submissions.map((s) => s.createdAt)),
    topRecurringIssues,
    averageAuditDurationHours: mean(auditDurations),
  };
}
