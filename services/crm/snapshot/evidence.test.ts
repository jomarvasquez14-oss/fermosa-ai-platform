// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import {
  compareSnapshotMetadata,
  contentHash,
  evidenceHash,
  recordCounts,
  selectorVersionOf,
  stableStringify,
  validateSnapshotRecord,
  type EvidenceSnapshot,
} from "./evidence";

function record(overrides: Partial<NormalizedCrmPatientRecord> = {}): NormalizedCrmPatientRecord {
  return {
    retrievedAt: "2026-07-14T08:00:00.000Z",
    connectorKind: "mock",
    sourceRef: "fixtures/v1",
    patient: {
      crmId: "c-1001",
      fullName: "Santos, Maria",
      firstName: "Maria",
      middleName: null,
      lastName: "Santos",
      nickname: null,
      dateOfBirth: "1992-03-14",
      email: null,
      mobileNo: "09171234567",
      membershipType: null,
      lastVisit: null,
    },
    treatments: [
      {
        performedAt: "2026-07-01",
        branch: { crmBranchId: "2", name: "Makati", platformBranchId: null },
        procedure: "GLUTA DRIP",
        packageName: "GLUTA DRIP (10)",
        sessionNumber: 7,
        sessionsTotal: 10,
        promoCode: null,
        intensitySettings: null,
        performedBy: { name: "Remelee Pulma", role: "unknown" },
        locked: false,
      },
    ],
    invoices: [
      {
        refNo: "007-162320",
        serviceName: "GLUTA DRIP",
        amount: "15999.00",
        amountPaid: "8000.00",
        balance: "7999.00",
        status: "partial",
        dateUpdated: "2026-07-01",
        payments: null,
      },
    ],
    activity: [
      {
        occurredAt: "2026-07-01T10:15:00",
        logName: "payments",
        description: "created",
        causedBy: "102 Remelee Pulma",
        changes: null,
      },
    ],
    ...overrides,
  };
}

describe("stableStringify", () => {
  it("is independent of object key order (jsonb round-trip safety)", () => {
    expect(stableStringify({ b: 1, a: { d: null, c: [2, 1] } })).toBe(
      stableStringify({ a: { c: [2, 1], d: null }, b: 1 })
    );
  });

  it("preserves array order — treatments are ordered evidence", () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});

describe("hashes", () => {
  it("contentHash is repeatable and covers provenance", () => {
    expect(contentHash(record())).toBe(contentHash(record()));
    expect(contentHash(record())).not.toBe(
      contentHash(record({ retrievedAt: "2026-07-14T09:00:00.000Z" }))
    );
  });

  it("evidenceHash ignores provenance but sees business changes", () => {
    const later = record({ retrievedAt: "2026-07-15T00:00:00.000Z", sourceRef: "fixtures/v2" });
    expect(evidenceHash(record())).toBe(evidenceHash(later));

    const edited = record();
    edited.invoices[0]!.amountPaid = "15999.00";
    expect(evidenceHash(record())).not.toBe(evidenceHash(edited));
  });
});

describe("validateSnapshotRecord", () => {
  it("accepts a schema-valid record", () => {
    expect(validateSnapshotRecord(record()).patient.crmId).toBe("c-1001");
  });

  it("rejects malformed evidence loudly with EVIDENCE_INVALID", () => {
    const malformed = { ...record(), invoices: [{ refNo: 42 }] };
    expect(() => validateSnapshotRecord(malformed)).toThrowError(/schema validation/);
    try {
      validateSnapshotRecord(malformed);
    } catch (error) {
      expect((error as { code: string }).code).toBe("EVIDENCE_INVALID");
    }
  });
});

describe("selectorVersionOf / recordCounts", () => {
  it("extracts the version token from sourceRef", () => {
    expect(selectorVersionOf("crm-selectors/v1 /clients/1001")).toBe("crm-selectors/v1");
    expect(selectorVersionOf("fixtures/v1")).toBe("fixtures/v1");
  });

  it("counts sections", () => {
    expect(recordCounts(record())).toEqual({ treatments: 1, invoices: 1, activity: 1 });
  });
});

describe("compareSnapshotMetadata", () => {
  function snapshotOf(rec: NormalizedCrmPatientRecord): EvidenceSnapshot {
    return {
      metadata: {
        id: "snap-1",
        submissionId: "sub-1",
        crmPatientId: rec.patient.crmId,
        connectorKind: rec.connectorKind,
        selectorVersion: selectorVersionOf(rec.sourceRef),
        snapshotVersion: 1,
        retrievedAt: rec.retrievedAt,
        window: null,
        contentHash: contentHash(rec),
        counts: recordCounts(rec),
        createdAt: rec.retrievedAt,
      },
      record: rec,
    };
  }

  it("reports identical when only provenance differs", () => {
    const live = record({ retrievedAt: "2026-07-15T00:00:00.000Z" });
    const result = compareSnapshotMetadata(snapshotOf(record()), live);
    expect(result.identical).toBe(true);
    expect(result.drift).toEqual([]);
  });

  it("names sections whose counts drifted", () => {
    const live = record();
    live.treatments = [...live.treatments, { ...live.treatments[0]!, performedAt: "2026-07-10" }];
    const result = compareSnapshotMetadata(snapshotOf(record()), live);
    expect(result.identical).toBe(false);
    expect(result.drift).toContain("treatments: 1 at snapshot time → 2 now");
  });

  it("flags field-level edits that keep counts unchanged", () => {
    const live = record();
    live.invoices[0]!.amountPaid = "15999.00";
    const result = compareSnapshotMetadata(snapshotOf(record()), live);
    expect(result.identical).toBe(false);
    expect(result.drift).toContain(
      "content changed within unchanged section counts (field-level edit)"
    );
  });

  it("flags demographic changes", () => {
    const live = record();
    live.patient = { ...live.patient, mobileNo: "09990000000" };
    const result = compareSnapshotMetadata(snapshotOf(record()), live);
    expect(result.identical).toBe(false);
    expect(result.drift).toContain("patient demographics changed");
  });
});
