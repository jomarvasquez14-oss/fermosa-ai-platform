// @vitest-environment node
// Finding service integration tests against the local PostgreSQL database.
import "../tests/helpers/load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import type { FindingDraft } from "@/lib/findings";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";
import { findingService } from "@/services/finding-service";

const runId = `f${Date.now().toString(36)}`;
let branchA: string;
let branchB: string;
let managerA: Actor;
let managerB: Actor;
let auditor: Actor;
let submissionId: string;

function draft(overrides: Partial<FindingDraft> = {}): FindingDraft {
  return {
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
    ...overrides,
  };
}

beforeAll(async () => {
  const mk = async (suffix: string) =>
    prisma.branch.create({
      data: { name: `Find Branch ${suffix} ${runId}`, code: `F${suffix}-${runId}`, address: "t" },
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
    id: (await mkUser("fmgr a", bmRole.id, branchA)).id,
    role: ROLES.BRANCH_MANAGER,
    branchId: branchA,
  };
  managerB = {
    id: (await mkUser("fmgr b", bmRole.id, branchB)).id,
    role: ROLES.BRANCH_MANAGER,
    branchId: branchB,
  };
  auditor = { id: (await mkUser("faud", audRole.id)).id, role: ROLES.AUDITOR, branchId: null };

  const submission = await auditSubmissionService.createDraft(managerA, {
    auditDate: new Date("2026-07-10T00:00:00Z"),
  });
  submissionId = submission.id;
}, 30000);

afterAll(async () => {
  await prisma.auditSubmission.deleteMany({ where: { branchId: { in: [branchA, branchB] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `.${runId}@` } } });
  await prisma.branch.deleteMany({ where: { id: { in: [branchA, branchB] } } });
  await prisma.$disconnect();
}, 30000);

describe("findingService", () => {
  it("persists producer drafts and is idempotent per (submission, source)", async () => {
    const first = await findingService.createForSubmission(submissionId, "RULE_ENGINE", [
      draft(),
      draft({ category: "RECORD_DELETED", severity: "CRITICAL", title: "Deleted record" }),
    ]);
    expect(first).toEqual({ created: 2, existing: 0 });

    const second = await findingService.createForSubmission(submissionId, "RULE_ENGINE", [draft()]);
    expect(second.created).toBe(0);
    expect(second.existing).toBe(2);

    const list = await findingService.listForSubmission(auditor, submissionId);
    expect(list).toHaveLength(2);
    expect(list[0]!.branchName).toContain("Find Branch A");
    expect(list[0]!.auditDate).toBe("2026-07-10");
  });

  it("rejects invalid evidence at the write boundary", async () => {
    const fresh = await auditSubmissionService.createDraft(managerA, { auditDate: new Date() });
    await expect(
      findingService.createForSubmission(fresh.id, "MANUAL_REVIEW", [
        draft({ evidence: [{ type: "screenshot", url: "x" } as never] }),
      ])
    ).rejects.toThrow();
  });

  it("scopes listing by branch for Branch Managers", async () => {
    const mine = await findingService.list(managerA);
    expect(mine.some((finding) => finding.submissionId === submissionId)).toBe(true);
    const theirs = await findingService.list(managerB);
    expect(theirs.some((finding) => finding.submissionId === submissionId)).toBe(false);
  });

  it("enforces the §5.5 workflow with timestamps and resolution notes", async () => {
    const [finding] = await findingService.listForSubmission(auditor, submissionId);

    await expect(findingService.transition(auditor, finding!.id, "RESOLVED")).rejects.toThrow(
      /Illegal finding transition/
    ); // OPEN → RESOLVED skips review

    const reviewed = await findingService.transition(auditor, finding!.id, "REVIEWED");
    expect(reviewed.status).toBe("REVIEWED");

    const resolved = await findingService.transition(
      auditor,
      finding!.id,
      "RESOLVED",
      "Verified against the physical receipt."
    );
    expect(resolved.status).toBe("RESOLVED");

    const row = await prisma.auditFinding.findUniqueOrThrow({ where: { id: finding!.id } });
    expect(row.reviewedAt).not.toBeNull();
    expect(row.resolvedAt).not.toBeNull();
    expect(row.resolution).toContain("physical receipt");

    const reopened = await findingService.transition(auditor, finding!.id, "OPEN");
    expect(reopened.status).toBe("OPEN");
    expect(
      (await prisma.auditFinding.findUniqueOrThrow({ where: { id: finding!.id } })).resolvedAt
    ).toBeNull();
  });

  it("hides out-of-scope findings from transition attempts", async () => {
    const [finding] = await findingService.listForSubmission(auditor, submissionId);
    await expect(findingService.transition(managerB, finding!.id, "REVIEWED")).rejects.toThrow(
      /not found/i
    );
  });
});
