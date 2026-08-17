// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { FindingRecord } from "@/services/finding-service";
import type { SnapshotMetadata } from "@/services/crm/snapshot";
import { buildReportModel, type ReportModel } from "./report-builder";
import { renderReportHtml } from "./report-html";

const SECTION_HEADINGS = [
  "Executive Summary",
  "Submission",
  "Branch",
  "Auditor",
  "Timeline",
  "Finding Summary",
  "Severity Summary",
  "Evidence",
  "Recommendations",
  "Appendix",
];

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "find-1",
    category: "MISSING_INVOICE",
    severity: "HIGH",
    status: "OPEN",
    source: "RULE_ENGINE",
    submissionId: "sub-1",
    branchName: "Makati Branch",
    auditDate: "2026-07-10",
    title: "Treatment encoded but never invoiced",
    detail: "A treatment was logged for the patient but no matching invoice exists in the CRM.",
    recommendation: "Generate the missing invoice.",
    expectedValue: "invoice present",
    actualValue: "no invoice found",
    evidence: [{ type: "note", text: "test evidence" }],
    confidence: 0.9,
    createdAt: "2026-07-11T08:00:00.000Z",
    ...overrides,
  };
}

function snapshot(overrides: Partial<SnapshotMetadata> = {}): SnapshotMetadata {
  return {
    id: "snap-1",
    submissionId: "sub-1",
    crmPatientId: "c-1001",
    connectorKind: "mock",
    selectorVersion: "fixtures/v1",
    snapshotVersion: 1,
    retrievedAt: "2026-07-10T09:00:00.000Z",
    window: null,
    contentHash: "a".repeat(64),
    counts: { treatments: 3, invoices: 2, activity: 1 },
    createdAt: "2026-07-10T09:00:01.000Z",
    ...overrides,
  };
}

const fixedInput = {
  submission: {
    id: "sub-1",
    branchName: "Makati Branch",
    auditDate: "2026-07-10",
    auditorName: "Jomar Vasquez",
    status: "SUBMITTED",
    submittedAt: "2026-07-11T10:00:00.000Z",
  },
  findings: [
    finding({ id: "find-1", severity: "HIGH", status: "OPEN", createdAt: "2026-07-11T08:00:00.000Z" }),
    finding({
      id: "find-2",
      severity: "LOW",
      status: "RESOLVED",
      category: "OTHER",
      createdAt: "2026-07-11T07:00:00.000Z",
    }),
    finding({ id: "find-3", severity: "HIGH", status: "OPEN", createdAt: "2026-07-11T06:00:00.000Z" }),
  ],
  snapshots: [snapshot()],
  generatedAt: "2026-07-12T00:00:00.000Z",
};

describe("buildReportModel", () => {
  it("summarizes findings by severity and status", () => {
    const model = buildReportModel(fixedInput);

    expect(model.severitySummary.HIGH).toBe(2);
    expect(model.severitySummary.LOW).toBe(1);
    expect(model.findingSummary.total).toBe(3);
    expect(model.findingSummary.byStatus.OPEN).toBe(2);
    expect(model.findingSummary.byStatus.RESOLVED).toBe(1);
  });

  it("sorts findings severity-desc (CRITICAL -> INFO) then createdAt", () => {
    const model = buildReportModel(fixedInput);

    expect(model.findings.map((f) => f.id)).toEqual(["find-3", "find-1", "find-2"]);
  });

  it("is deterministic: two calls with the same input produce deep-equal models", () => {
    const first = buildReportModel(fixedInput);
    const second = buildReportModel(fixedInput);

    expect(second).toEqual(first);
  });

  it("carries the given generatedAt through untouched", () => {
    const model = buildReportModel(fixedInput);
    expect(model.generatedAt).toBe("2026-07-12T00:00:00.000Z");
  });

  it("derives appendix hashes and connector/selector from the snapshots", () => {
    const model = buildReportModel(fixedInput);
    expect(model.appendix.snapshotHashes).toEqual([snapshot().contentHash]);
    expect(model.appendix.connectorKind).toBe("mock");
    expect(model.appendix.selectorVersion).toBe("fixtures/v1");
  });

  it("returns null appendix connector/selector and empty hashes when there is no evidence", () => {
    const model = buildReportModel({ ...fixedInput, snapshots: [] });
    expect(model.appendix.connectorKind).toBeNull();
    expect(model.appendix.selectorVersion).toBeNull();
    expect(model.appendix.snapshotHashes).toEqual([]);
  });
});

describe("renderReportHtml", () => {
  const model: ReportModel = buildReportModel(fixedInput);

  it("contains every required section heading", () => {
    const html = renderReportHtml(model);
    for (const heading of SECTION_HEADINGS) {
      expect(html).toContain(heading);
    }
  });

  it("is self-contained: no <script>, no external URLs", () => {
    const html = renderReportHtml(model);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });

  it("HTML-escapes interpolated values", () => {
    const dirty = buildReportModel({
      ...fixedInput,
      submission: { ...fixedInput.submission, auditorName: '<script>alert("x")</script>' },
    });
    const html = renderReportHtml(dirty);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("is byte-identical across two calls with the same model", () => {
    const first = renderReportHtml(model);
    const second = renderReportHtml(model);
    expect(second).toBe(first);
  });
});
