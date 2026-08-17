// @vitest-environment node
// Snapshot engine integration tests against the local PostgreSQL database.
import "../../../tests/helpers/load-env";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { MockCRMConnector } from "@/services/crm/connectors/mock/mock-crm-connector";
import { compareSnapshotMetadata, evidenceHash } from "./evidence";
import { snapshotService } from "./snapshot-service";

const runId = `s${Date.now().toString(36)}`;
const connector = new MockCRMConnector();
let branchId: string;
let userId: string;
let submissionId: string;

beforeAll(async () => {
  branchId = (
    await prisma.branch.create({
      data: { name: `Snap Branch ${runId}`, code: `SNAP-${runId}`, address: "t" },
    })
  ).id;
  const role = await prisma.role.upsert({
    where: { name: "AUDITOR" },
    update: {},
    create: { name: "AUDITOR" },
  });
  userId = (
    await prisma.user.create({
      data: {
        fullName: "snap auditor",
        email: `snap.auditor.${runId}@test.local`,
        passwordHash: "x",
        roleId: role.id,
      },
    })
  ).id;
  submissionId = (
    await prisma.auditSubmission.create({
      data: {
        auditDate: new Date("2026-07-10T00:00:00Z"),
        branchId,
        submittedById: userId,
      },
    })
  ).id;
}, 30000);

afterAll(async () => {
  await prisma.auditSubmission.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { email: { contains: `.${runId}@` } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
}, 30000);

describe("snapshotService", () => {
  it("creates sealed evidence with full provenance metadata", async () => {
    const snapshot = await snapshotService.createSnapshot(
      { submissionId, crmId: "c-1001" },
      connector
    );

    expect(snapshot.metadata.submissionId).toBe(submissionId);
    expect(snapshot.metadata.crmPatientId).toBe("c-1001");
    expect(snapshot.metadata.connectorKind).toBe("mock");
    expect(snapshot.metadata.selectorVersion).toBe("fixtures/v1");
    expect(snapshot.metadata.snapshotVersion).toBe(1);
    expect(snapshot.metadata.window).toBeNull();
    expect(snapshot.metadata.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.metadata.counts.treatments).toBeGreaterThan(0);
    expect(snapshot.record.patient.fullName).toContain("Santos");
  });

  it("round-trips through the database: load parses, verifies, and matches", async () => {
    const created = await snapshotService.createSnapshot(
      { submissionId, crmId: "c-1001" },
      connector
    );
    const loaded = await snapshotService.loadSnapshot(created.metadata.id);

    expect(loaded.metadata.contentHash).toBe(created.metadata.contentHash);
    expect(loaded.record).toEqual(created.record);
  });

  it("is repeatable: re-capturing an unchanged patient yields identical evidence", async () => {
    const first = await snapshotService.createSnapshot(
      { submissionId, crmId: "c-1002" },
      connector
    );
    const second = await snapshotService.createSnapshot(
      { submissionId, crmId: "c-1002" },
      connector
    );

    expect(second.metadata.id).not.toBe(first.metadata.id);
    // retrievedAt differs, so full content hashes may differ — the EVIDENCE
    // (business content) must not.
    expect(evidenceHash(second.record)).toBe(evidenceHash(first.record));
  });

  it("records the retrieval window and applies it to the evidence", async () => {
    const window = { from: "1900-01-01", to: "1900-12-31" };
    const snapshot = await snapshotService.createSnapshot(
      { submissionId, crmId: "c-1001", window },
      connector
    );
    expect(snapshot.metadata.window).toEqual(window);
    expect(snapshot.metadata.counts).toEqual({ treatments: 0, invoices: 0, activity: 0 });
  });

  it("detects post-capture tampering on load (EVIDENCE_INTEGRITY)", async () => {
    const created = await snapshotService.createSnapshot(
      { submissionId, crmId: "c-1001" },
      connector
    );
    const tampered = structuredClone(created.record);
    tampered.invoices = [];
    await prisma.auditEvidenceSnapshot.update({
      where: { id: created.metadata.id },
      data: { record: tampered as unknown as Prisma.InputJsonValue },
    });

    await expect(snapshotService.loadSnapshot(created.metadata.id)).rejects.toMatchObject({
      code: "EVIDENCE_INTEGRITY",
    });

    // Corrupt evidence also poisons list views (loud by design) — remove it
    // so later tests see only intact snapshots.
    await prisma.auditEvidenceSnapshot.delete({ where: { id: created.metadata.id } });
  });

  it("rejects malformed stored evidence on load (EVIDENCE_INVALID)", async () => {
    const created = await snapshotService.createSnapshot(
      { submissionId, crmId: "c-1001" },
      connector
    );
    await prisma.auditEvidenceSnapshot.update({
      where: { id: created.metadata.id },
      data: { record: { not: "a record" } as unknown as Prisma.InputJsonValue },
    });

    await expect(snapshotService.loadSnapshot(created.metadata.id)).rejects.toMatchObject({
      code: "EVIDENCE_INVALID",
    });

    await prisma.auditEvidenceSnapshot.delete({ where: { id: created.metadata.id } });
  });

  it("refuses snapshots for unknown submissions or snapshot ids", async () => {
    await expect(
      snapshotService.createSnapshot({ submissionId: "missing", crmId: "c-1001" }, connector)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(snapshotService.loadSnapshot("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("propagates connector NOT_FOUND for unknown patients without persisting", async () => {
    const before = await prisma.auditEvidenceSnapshot.count({ where: { submissionId } });
    await expect(
      snapshotService.createSnapshot({ submissionId, crmId: "c-9999" }, connector)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.auditEvidenceSnapshot.count({ where: { submissionId } })).toBe(before);
  });

  it("compares a stored snapshot against a fresh live read", async () => {
    const snapshot = await snapshotService.createSnapshot(
      { submissionId, crmId: "c-1004" },
      connector
    );
    const live = await connector.fetchPatientRecord("c-1004");
    const comparison = compareSnapshotMetadata(snapshot, live);
    expect(comparison.identical).toBe(true);
    expect(comparison.drift).toEqual([]);
    expect(comparison.snapshot.evidenceHash).toBe(comparison.live.evidenceHash);
  });

  it("lists a submission's snapshots newest first", async () => {
    const list = await snapshotService.listForSubmission(submissionId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1]!.createdAt >= list[i]!.createdAt).toBe(true);
    }
  });
});
