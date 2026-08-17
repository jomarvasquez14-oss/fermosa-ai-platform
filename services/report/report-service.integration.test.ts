// @vitest-environment node
// Report service integration tests against the local PostgreSQL database.
import "../../tests/helpers/load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";
import { MockCRMConnector } from "@/services/crm/connectors/mock/mock-crm-connector";
import { snapshotService } from "@/services/crm/snapshot";
import { findingService } from "@/services/finding-service";
import { getReport } from "./report-service";

const runId = `r${Date.now().toString(36)}`;
const connector = new MockCRMConnector();

let branchA: string;
let branchB: string;
let managerA: Actor;
let managerB: Actor;
let auditor: Actor;
let submissionId: string;

beforeAll(async () => {
  const mk = async (suffix: string) =>
    prisma.branch.create({
      data: { name: `Report Branch ${suffix} ${runId}`, code: `RPT${suffix}-${runId}`, address: "t" },
    });
  branchA = (await mk("A")).id;
  branchB = (await mk("B")).id;

  const bmRole = await prisma.role.upsert({
    where: { name: "BRANCH_MANAGER" },
    update: {},
    create: { name: "BRANCH_MANAGER" },
  });
  const audRole = await prisma.role.upsert({
    where: { name: "AUDITOR" },
    update: {},
    create: { name: "AUDITOR" },
  });
  const mkUser = async (name: string, roleId: string, branchId?: string) =>
    prisma.user.create({
      data: {
        fullName: name,
        email: `${name.replace(/\s/g, ".").toLowerCase()}.${runId}@test.local`,
        passwordHash: "x",
        roleId,
        branchId,
      },
    });

  managerA = {
    id: (await mkUser("rpt mgr a", bmRole.id, branchA)).id,
    role: ROLES.BRANCH_MANAGER,
    branchId: branchA,
  };
  managerB = {
    id: (await mkUser("rpt mgr b", bmRole.id, branchB)).id,
    role: ROLES.BRANCH_MANAGER,
    branchId: branchB,
  };
  auditor = { id: (await mkUser("rpt aud", audRole.id)).id, role: ROLES.AUDITOR, branchId: null };

  const submission = await auditSubmissionService.createDraft(managerA, {
    auditDate: new Date("2026-07-10T00:00:00Z"),
  });
  submissionId = submission.id;

  await findingService.createForSubmission(submissionId, "RULE_ENGINE", [
    {
      category: "MISSING_INVOICE",
      severity: "HIGH",
      source: "RULE_ENGINE",
      title: "Treatment encoded but never invoiced",
      detail: "test detail",
      recommendation: null,
      expectedValue: "invoice",
      actualValue: "none",
      evidence: [{ type: "note", text: "test evidence" }],
      confidence: 0.9,
    },
  ]);

  await snapshotService.createSnapshot({ submissionId, crmId: "c-1001" }, connector);
}, 30000);

afterAll(async () => {
  await prisma.auditSubmission.deleteMany({ where: { branchId: { in: [branchA, branchB] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `.${runId}@` } } });
  await prisma.branch.deleteMany({ where: { id: { in: [branchA, branchB] } } });
  await prisma.$disconnect();
}, 30000);

describe("getReport", () => {
  it("returns a populated, reproducible report for an Auditor (all-branch access)", async () => {
    const model = await getReport(auditor, submissionId);

    expect(model.submission.id).toBe(submissionId);
    expect(model.submission.branchName).toContain("Report Branch A");
    expect(model.findings.length).toBeGreaterThanOrEqual(1);
    expect(model.evidence.length).toBeGreaterThanOrEqual(1);
    expect(model.appendix.snapshotHashes.length).toBeGreaterThanOrEqual(1);
  });

  it("allows the owning Branch Manager to read their own branch's report", async () => {
    const model = await getReport(managerA, submissionId);
    expect(model.submission.id).toBe(submissionId);
  });

  it("hides the report from a Branch Manager of a different branch", async () => {
    await expect(getReport(managerB, submissionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("hides reports for unknown submission ids", async () => {
    await expect(getReport(auditor, "missing-submission")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
