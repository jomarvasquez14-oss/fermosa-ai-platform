// @vitest-environment node
// Integration tests against the local PostgreSQL database (Prisma).
// All rows are created under a dedicated throwaway branch and removed after.
import "../tests/helpers/load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ROLES } from "@/lib/auth/roles";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";

const runId = `t${Date.now().toString(36)}`;

let branchA: { id: string };
let branchB: { id: string };
let managerA: Actor;
let managerB: Actor;
let auditor: Actor;
let admin: Actor;

async function createUser(
  roleName: "SUPER_ADMIN" | "AUDITOR" | "BRANCH_MANAGER",
  branchId?: string
) {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: {},
    create: { name: roleName },
  });
  const user = await prisma.user.create({
    data: {
      fullName: `Test ${roleName} ${runId}`,
      email: `${roleName.toLowerCase()}.${runId}.${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: "x",
      roleId: role.id,
      branchId,
    },
  });
  return user.id;
}

async function draftWithStoredImages(actor: Actor, count: number) {
  const submission = await auditSubmissionService.createDraft(actor, {
    auditDate: new Date("2026-07-10T00:00:00Z"),
  });
  const imageIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const image = await auditSubmissionService.addImage(actor, submission.id, {
      originalFileName: `page-${i + 1}.png`,
      mimeType: "image/png",
      fileSizeBytes: 100,
    });
    await auditSubmissionService.markImageStored(
      actor,
      image.id,
      `test/${submission.id}/${image.id}`
    );
    imageIds.push(image.id);
  }
  return { submissionId: submission.id, imageIds };
}

beforeAll(async () => {
  branchA = await prisma.branch.create({
    data: { name: `Test Branch A ${runId}`, code: `TA-${runId}`, address: "test" },
  });
  branchB = await prisma.branch.create({
    data: { name: `Test Branch B ${runId}`, code: `TB-${runId}`, address: "test" },
  });
  managerA = {
    id: await createUser("BRANCH_MANAGER", branchA.id),
    role: ROLES.BRANCH_MANAGER,
    branchId: branchA.id,
  };
  managerB = {
    id: await createUser("BRANCH_MANAGER", branchB.id),
    role: ROLES.BRANCH_MANAGER,
    branchId: branchB.id,
  };
  auditor = { id: await createUser("AUDITOR"), role: ROLES.AUDITOR, branchId: null };
  admin = { id: await createUser("SUPER_ADMIN"), role: ROLES.SUPER_ADMIN, branchId: null };
}, 30000);

afterAll(async () => {
  await prisma.auditSubmission.deleteMany({
    where: { branchId: { in: [branchA.id, branchB.id] } },
  });
  await prisma.user.deleteMany({ where: { email: { contains: `.${runId}.` } } });
  await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } });
  await prisma.$disconnect();
}, 30000);

describe("draft lifecycle", () => {
  it("creates a DRAFT with a SUBMISSION_CREATED trail entry", async () => {
    const submission = await auditSubmissionService.createDraft(managerA, {
      auditDate: new Date("2026-07-01T00:00:00Z"),
      notes: "first draft",
    });
    expect(submission.status).toBe("DRAFT");
    expect(submission.branchId).toBe(branchA.id);

    const trail = await auditSubmissionService.getTrail(managerA, submission.id);
    expect(trail.map((entry) => entry.action)).toEqual(["SUBMISSION_CREATED"]);
  });

  it("assigns stable ids and contiguous display order to images", async () => {
    const { submissionId, imageIds } = await draftWithStoredImages(managerA, 3);
    const submission = await auditSubmissionService.get(managerA, submissionId);
    expect(submission.images.map((image) => image.id)).toEqual(imageIds);
    expect(submission.images.map((image) => image.displayOrder)).toEqual([1, 2, 3]);
  });

  it("recovers a saved draft losslessly (order, rotation, date)", async () => {
    const { submissionId, imageIds } = await draftWithStoredImages(managerA, 3);

    await auditSubmissionService.saveDraft(managerA, submissionId, {
      auditDate: new Date("2026-06-15T00:00:00Z"),
      images: [
        { imageId: imageIds[2]!, displayOrder: 1, rotation: 90 },
        { imageId: imageIds[0]!, displayOrder: 2, rotation: 0 },
        { imageId: imageIds[1]!, displayOrder: 3, rotation: 270 },
      ],
    });

    // Fresh read = what a reopened draft restores.
    const reopened = await auditSubmissionService.get(managerA, submissionId);
    expect(reopened.images.map((image) => image.id)).toEqual([
      imageIds[2],
      imageIds[0],
      imageIds[1],
    ]);
    expect(reopened.images.map((image) => image.rotation)).toEqual([90, 0, 270]);
    expect(reopened.auditDate.toISOString().slice(0, 10)).toBe("2026-06-15");

    const trail = await auditSubmissionService.getTrail(managerA, submissionId);
    expect(trail.map((entry) => entry.action)).toContain("DRAFT_SAVED");
    expect(trail.map((entry) => entry.action)).toContain("IMAGE_REORDERED");
  });

  it("closes the display-order gap when an image is removed", async () => {
    const { submissionId, imageIds } = await draftWithStoredImages(managerA, 3);
    await auditSubmissionService.removeImage(managerA, imageIds[1]!);

    const submission = await auditSubmissionService.get(managerA, submissionId);
    expect(submission.images.map((image) => image.displayOrder)).toEqual([1, 2]);
    const trail = await auditSubmissionService.getTrail(managerA, submissionId);
    expect(trail.map((entry) => entry.action)).toContain("IMAGE_REMOVED");
  });

  it("rejects a draft layout that does not match the submission's images", async () => {
    const { submissionId } = await draftWithStoredImages(managerA, 2);
    await expect(
      auditSubmissionService.saveDraft(managerA, submissionId, {
        auditDate: new Date("2026-07-10T00:00:00Z"),
        images: [{ imageId: "not-a-real-image", displayOrder: 1, rotation: 0 }],
      })
    ).rejects.toThrow(/does not match/);
  });
});

describe("permissions", () => {
  it("hides other branches' submissions from Branch Managers", async () => {
    const { submissionId } = await draftWithStoredImages(managerA, 1);
    await expect(auditSubmissionService.get(managerB, submissionId)).rejects.toThrow(/not found/i);

    const listB = await auditSubmissionService.list(managerB);
    expect(listB.some((s) => s.id === submissionId)).toBe(false);
  });

  it("lets Auditors read everything but mutate nothing", async () => {
    const { submissionId, imageIds } = await draftWithStoredImages(managerA, 1);

    const seen = await auditSubmissionService.get(auditor, submissionId);
    expect(seen.id).toBe(submissionId);

    await expect(
      auditSubmissionService.createDraft(auditor, { auditDate: new Date() })
    ).rejects.toThrow();
    await expect(
      auditSubmissionService.addImage(auditor, submissionId, { originalFileName: "x.png" })
    ).rejects.toThrow();
    await expect(auditSubmissionService.removeImage(auditor, imageIds[0]!)).rejects.toThrow();
    await expect(auditSubmissionService.submit(auditor, submissionId)).rejects.toThrow();
  });

  it("gives Super Admins full access across branches", async () => {
    const { submissionId } = await draftWithStoredImages(managerA, 1);
    const submission = await auditSubmissionService.get(admin, submissionId);
    expect(submission.id).toBe(submissionId);
    const submitted = await auditSubmissionService.submit(admin, submissionId);
    expect(submitted.status).toBe("SUBMITTED");
  });
});

describe("submission locking", () => {
  it("requires at least one image", async () => {
    const submission = await auditSubmissionService.createDraft(managerA, {
      auditDate: new Date("2026-07-10T00:00:00Z"),
    });
    await expect(auditSubmissionService.submit(managerA, submission.id)).rejects.toThrow(
      /at least one/i
    );
  });

  it("blocks submit while any image is not STORED", async () => {
    const submission = await auditSubmissionService.createDraft(managerA, {
      auditDate: new Date("2026-07-10T00:00:00Z"),
    });
    const image = await auditSubmissionService.addImage(managerA, submission.id, {
      originalFileName: "broken.png",
    });
    await auditSubmissionService.markImageFailed(managerA, image.id);
    await expect(auditSubmissionService.submit(managerA, submission.id)).rejects.toThrow(
      /not finished uploading/i
    );
  });

  it("locks the submission after SUBMITTED: no mutations, ever", async () => {
    const { submissionId, imageIds } = await draftWithStoredImages(managerA, 2);
    const submitted = await auditSubmissionService.submit(managerA, submissionId);
    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.submittedAt).not.toBeNull();

    await expect(
      auditSubmissionService.addImage(managerA, submissionId, { originalFileName: "late.png" })
    ).rejects.toThrow(/read-only/i);
    await expect(auditSubmissionService.removeImage(managerA, imageIds[0]!)).rejects.toThrow(
      /read-only/i
    );
    await expect(
      auditSubmissionService.saveDraft(managerA, submissionId, {
        auditDate: new Date("2026-07-11T00:00:00Z"),
        images: [
          { imageId: imageIds[0]!, displayOrder: 1, rotation: 90 },
          { imageId: imageIds[1]!, displayOrder: 2, rotation: 0 },
        ],
      })
    ).rejects.toThrow(/read-only/i);
    // Double submit is rejected too.
    await expect(auditSubmissionService.submit(managerA, submissionId)).rejects.toThrow(
      /read-only/i
    );

    const trail = await auditSubmissionService.getTrail(managerA, submissionId);
    expect(trail.map((entry) => entry.action)).toContain("SUBMISSION_SUBMITTED");
  });
});
