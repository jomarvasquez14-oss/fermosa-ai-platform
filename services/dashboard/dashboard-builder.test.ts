// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { FindingSeverity, FindingStatus } from "@/lib/findings";
import {
  buildAdminDashboard,
  buildAuditorDashboard,
  buildBranchDashboard,
} from "./dashboard-builder";
import type {
  DashboardFindingRow,
  DashboardInput,
  DashboardSubmissionRow,
} from "./types";

function submission(overrides: Partial<DashboardSubmissionRow> = {}): DashboardSubmissionRow {
  return {
    id: "s-1",
    branchId: "b-1",
    branchName: "Fermosa Tejero",
    status: "COMPLETED",
    auditDate: "2026-06-15",
    submittedAt: "2026-06-16T08:00:00.000Z",
    completedAt: "2026-06-16T12:00:00.000Z",
    createdAt: "2026-06-16T07:00:00.000Z",
    ...overrides,
  };
}

function finding(overrides: Partial<DashboardFindingRow> = {}): DashboardFindingRow {
  return {
    id: "f-1",
    submissionId: "s-1",
    branchId: "b-1",
    category: "MISMATCHED_FIELD",
    severity: "MEDIUM" as FindingSeverity,
    status: "OPEN" as FindingStatus,
    createdAt: "2026-06-16T09:00:00.000Z",
    reviewedAt: null,
    resolvedAt: null,
    ...overrides,
  };
}

function input(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return {
    submissions: overrides.submissions ?? [submission()],
    findings: overrides.findings ?? [],
    branches: overrides.branches ?? [{ id: "b-1", name: "Fermosa Tejero" }],
  };
}

describe("buildAuditorDashboard", () => {
  it("counts pending vs completed, critical (non-resolved), and the review queue", () => {
    const d = buildAuditorDashboard(
      input({
        submissions: [
          submission({ id: "s-1", status: "COMPLETED" }),
          submission({ id: "s-2", status: "OCR_REVIEW", completedAt: null }),
          submission({ id: "s-3", status: "DRAFT", completedAt: null }), // drafts are not "pending"
        ],
        findings: [
          finding({ id: "f-1", status: "OPEN", severity: "CRITICAL" }),
          finding({ id: "f-2", status: "RESOLVED", severity: "CRITICAL" }), // resolved critical excluded
          finding({ id: "f-3", status: "OPEN", severity: "LOW" }),
        ],
      })
    );
    expect(d.completedAudits).toBe(1);
    expect(d.pendingAudits).toBe(1);
    expect(d.criticalFindings).toBe(1);
    expect(d.reviewQueue).toBe(2);
  });

  it("averages review time only over reviewed findings (null when none)", () => {
    const reviewed = finding({
      createdAt: "2026-06-16T09:00:00.000Z",
      reviewedAt: "2026-06-16T13:00:00.000Z", // +4h
      status: "REVIEWED",
    });
    const d = buildAuditorDashboard(input({ findings: [reviewed, finding({ id: "f-open" })] }));
    expect(d.averageReviewTimeHours).toBe(4);

    const none = buildAuditorDashboard(input({ findings: [finding()] }));
    expect(none.averageReviewTimeHours).toBeNull();
  });
});

describe("buildBranchDashboard", () => {
  it("scopes to the branch, scores audit completion, and lists open/resolved", () => {
    const d = buildBranchDashboard(
      input({
        submissions: [
          submission({ id: "s-1", branchId: "b-1", status: "COMPLETED" }),
          submission({ id: "s-2", branchId: "b-1", status: "OCR_REVIEW" }),
          submission({ id: "s-3", branchId: "b-2", status: "COMPLETED" }), // other branch — ignored
        ],
        findings: [
          finding({ id: "f-1", branchId: "b-1", status: "OPEN", severity: "HIGH" }),
          finding({ id: "f-2", branchId: "b-1", status: "RESOLVED" }),
          finding({ id: "f-3", branchId: "b-2", status: "OPEN", severity: "CRITICAL" }), // other branch
        ],
      }),
      "b-1",
      "Fermosa Tejero"
    );
    expect(d.auditScore).toBe(50); // 1 of 2 branch submissions COMPLETED
    expect(d.openFindings).toBe(1);
    expect(d.resolvedFindings).toBe(1);
    expect(d.complianceScore).toBeLessThan(100); // an open HIGH costs points
    expect(d.history.length).toBeGreaterThan(0);
  });

  it("scores 100 compliance and audit for a branch with no submissions or findings", () => {
    const d = buildBranchDashboard(
      { submissions: [], findings: [], branches: [{ id: "b-9", name: "New" }] },
      "b-9",
      "New"
    );
    expect(d.auditScore).toBe(100);
    expect(d.complianceScore).toBe(100);
    expect(d.history).toEqual([]);
  });
});

describe("buildAdminDashboard", () => {
  it("ranks branches by compliance, aggregates trends, and finds top categories", () => {
    const d = buildAdminDashboard({
      branches: [
        { id: "b-1", name: "Tejero" },
        { id: "b-2", name: "Imus" },
      ],
      submissions: [
        submission({ id: "s-1", branchId: "b-1", status: "COMPLETED", createdAt: "2026-05-01T00:00:00.000Z" }),
        submission({ id: "s-2", branchId: "b-2", status: "COMPLETED", createdAt: "2026-06-01T00:00:00.000Z" }),
      ],
      findings: [
        finding({ id: "f-1", submissionId: "s-2", branchId: "b-2", status: "OPEN", severity: "CRITICAL", category: "RECORD_DELETED", createdAt: "2026-06-02T00:00:00.000Z" }),
        finding({ id: "f-2", submissionId: "s-2", branchId: "b-2", status: "OPEN", severity: "HIGH", category: "RECORD_DELETED", createdAt: "2026-06-03T00:00:00.000Z" }),
      ],
    });
    // b-1 (no findings) outranks b-2 (open critical+high).
    expect(d.branchRanking[0]!.branchId).toBe("b-1");
    expect(d.branchRanking[1]!.branchId).toBe("b-2");
    expect(d.topRecurringIssues[0]).toEqual({ label: "RECORD_DELETED", value: 2 });
    // Two months of audit volume, chronological.
    expect(d.monthlyAuditVolume.map((c) => c.label)).toEqual(["2026-05", "2026-06"]);
    // Average duration = 4h from the seeded submit→complete gap.
    expect(d.averageAuditDurationHours).toBe(4);
  });

  it("returns null average duration when no submission has both timestamps", () => {
    const d = buildAdminDashboard({
      branches: [{ id: "b-1", name: "Tejero" }],
      submissions: [submission({ submittedAt: null, completedAt: null, status: "OCR_REVIEW" })],
      findings: [],
    });
    expect(d.averageAuditDurationHours).toBeNull();
  });
});
