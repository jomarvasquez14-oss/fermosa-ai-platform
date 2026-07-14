import { FINDING_STATUSES, SEVERITY_RANK, type FindingCategory } from "@/lib/findings";
import type { FindingRecord } from "@/services/finding-service";
import type { SnapshotMetadata } from "@/services/crm/snapshot";

/**
 * Audit report model (M0046) — the pure, reproducible aggregate rendered by
 * `renderReportHtml` and `components/report/audit-report.tsx`. Assembled ONLY
 * from data already at rest (a submission, its findings, its evidence
 * snapshots) — no live CRM read happens here or anywhere downstream of it.
 */

export interface ReportModel {
  generatedAt: string;
  submission: {
    id: string;
    branchName: string;
    auditDate: string;
    auditorName: string;
    status: string;
    submittedAt: string | null;
  };
  timeline: Array<{ at: string; label: string }>;
  findingSummary: { total: number; byStatus: Record<string, number> };
  severitySummary: Record<"INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number>;
  findings: FindingRecord[];
  evidence: SnapshotMetadata[];
  recommendations: string[];
  appendix: { connectorKind: string | null; selectorVersion: string | null; snapshotHashes: string[] };
}

export interface BuildReportModelInput {
  submission: {
    id: string;
    branchName: string;
    auditDate: string;
    auditorName: string;
    status: string;
    submittedAt: string | null;
  };
  findings: FindingRecord[];
  snapshots: SnapshotMetadata[];
  generatedAt: string;
}

/**
 * Static recommendation keyed off which finding categories are present.
 * RECORD_EDITED and RECORD_DELETED share one recommendation (both indicate
 * post-audit CRM changes) so it is added once even if both are present.
 */
const CATEGORY_RECOMMENDATIONS: Partial<Record<FindingCategory, string>> = {
  MISSING_IN_CRM: "Enter the missing logbook entries into the CRM.",
  MISSING_IN_LOGBOOK: "Investigate CRM entries with no corresponding logbook record.",
  MISMATCHED_FIELD: "Reconcile the mismatched fields between the logbook and the CRM.",
  UNMATCHED_PATIENT: "Resolve unmatched patient identities before closing this audit.",
  AMBIGUOUS_PATIENT: "Disambiguate the patient matches flagged during CRM comparison.",
  MISSING_INVOICE: "Generate missing invoices for the treatments identified in this audit.",
  UNREADABLE_ENTRY: "Re-photograph the unreadable logbook entries.",
  DUPLICATE_ENTRY: "Remove or merge the duplicate entries identified in this audit.",
};
const POST_AUDIT_CHANGE_RECOMMENDATION =
  "Investigate post-audit CRM changes: one or more records were edited or deleted after the audit period.";

function buildRecommendations(findings: FindingRecord[]): string[] {
  const present = new Set(findings.map((f) => f.category));
  const recommendations: string[] = [];

  for (const [category, recommendation] of Object.entries(CATEGORY_RECOMMENDATIONS)) {
    if (present.has(category as FindingCategory)) recommendations.push(recommendation);
  }
  if (present.has("RECORD_EDITED") || present.has("RECORD_DELETED")) {
    recommendations.push(POST_AUDIT_CHANGE_RECOMMENDATION);
  }
  return recommendations;
}

function compareFindings(a: FindingRecord, b: FindingRecord): number {
  const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (bySeverity !== 0) return bySeverity;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

function buildTimeline(
  submission: BuildReportModelInput["submission"],
  snapshots: SnapshotMetadata[]
): Array<{ at: string; label: string }> {
  const entries: Array<{ at: string; label: string }> = [
    { at: submission.auditDate, label: "Audit date" },
  ];
  if (submission.submittedAt !== null) {
    entries.push({ at: submission.submittedAt, label: "Submission submitted" });
  }
  for (const snapshot of snapshots) {
    entries.push({
      at: snapshot.retrievedAt,
      label: `Evidence captured (patient ${snapshot.crmPatientId})`,
    });
  }
  return entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Pure assembly of the report model — no I/O, no clock reads. */
export function buildReportModel(input: BuildReportModelInput): ReportModel {
  const findings = [...input.findings].sort(compareFindings);

  const byStatus: Record<string, number> = Object.fromEntries(
    FINDING_STATUSES.map((status) => [status, 0])
  );
  for (const finding of findings) {
    byStatus[finding.status] = (byStatus[finding.status] ?? 0) + 1;
  }

  const severitySummary: ReportModel["severitySummary"] = {
    INFO: 0,
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  for (const finding of findings) {
    severitySummary[finding.severity] += 1;
  }

  const firstSnapshot = input.snapshots[0] ?? null;

  return {
    generatedAt: input.generatedAt,
    submission: { ...input.submission },
    timeline: buildTimeline(input.submission, input.snapshots),
    findingSummary: { total: findings.length, byStatus },
    severitySummary,
    findings,
    evidence: [...input.snapshots],
    recommendations: buildRecommendations(findings),
    appendix: {
      connectorKind: firstSnapshot?.connectorKind ?? null,
      selectorVersion: firstSnapshot?.selectorVersion ?? null,
      snapshotHashes: input.snapshots.map((s) => s.contentHash),
    },
  };
}
