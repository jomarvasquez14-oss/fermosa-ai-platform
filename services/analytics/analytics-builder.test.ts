// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import { buildAnalytics } from "./analytics-builder";

function record(overrides: Partial<NormalizedCrmPatientRecord> = {}): NormalizedCrmPatientRecord {
  return {
    retrievedAt: "2026-07-14T00:00:00Z",
    connectorKind: "mock",
    sourceRef: "test",
    patient: {
      crmId: "c-1",
      fullName: "Santos, Maria",
      firstName: "Maria",
      middleName: null,
      lastName: "Santos",
      nickname: null,
      dateOfBirth: null,
      email: null,
      mobileNo: null,
      membershipType: null,
      lastVisit: null,
    },
    treatments: [],
    invoices: [],
    activity: [],
    ...overrides,
  };
}

function treatment(over: Partial<NormalizedCrmPatientRecord["treatments"][number]> = {}) {
  return {
    performedAt: "2026-07-10",
    branch: { crmBranchId: "26", name: "Fermosa Tejero", platformBranchId: null },
    procedure: "Diamond Peel",
    packageName: null,
    sessionNumber: null,
    sessionsTotal: null,
    promoCode: null,
    intensitySettings: null,
    performedBy: { name: "J. Cruz", role: "aesthetician" as const },
    locked: false,
    ...over,
  };
}

function invoice(over: Partial<NormalizedCrmPatientRecord["invoices"][number]> = {}) {
  return {
    refNo: "INV-1",
    serviceName: "Diamond Peel",
    amount: "1500.00",
    amountPaid: "1500.00",
    balance: "0.00",
    status: "paid",
    dateUpdated: "2026-07-10",
    payments: null,
    ...over,
  };
}

function activity(over: Partial<NormalizedCrmPatientRecord["activity"][number]> = {}) {
  return {
    occurredAt: "2026-07-10T10:00:00Z",
    logName: "invoices",
    description: "Invoice updated",
    causedBy: "encoder.1",
    changes: null,
    ...over,
  };
}

describe("buildAnalytics", () => {
  it("returns an honest zeroed model for no snapshots", () => {
    const m = buildAnalytics([]);
    expect(m.snapshotCount).toBe(0);
    expect(m.patientCount).toBe(0);
    expect(m.topBranches).toEqual([]);
    expect(m.totalRevenuePaid).toBe("0.00");
    expect(m.packageCompletion.averagePercent).toBeNull();
  });

  it("aggregates branches, procedures, staff, roles, and distinct patients", () => {
    const records = [
      record({
        patient: { ...record().patient, crmId: "c-1" },
        treatments: [
          treatment({ branch: { crmBranchId: "26", name: "Tejero", platformBranchId: null }, procedure: "Diamond Peel", performedBy: { name: "Cruz", role: "aesthetician" } }),
          treatment({ branch: { crmBranchId: "27", name: "Imus", platformBranchId: null }, procedure: "Gluta Drip", performedBy: { name: "Reyes", role: "encoder" } }),
        ],
      }),
      record({
        patient: { ...record().patient, crmId: "c-2" },
        treatments: [
          treatment({ branch: { crmBranchId: "26", name: "Tejero", platformBranchId: null }, procedure: "Diamond Peel", performedBy: { name: "Cruz", role: "unknown" } }),
        ],
      }),
    ];
    const m = buildAnalytics(records);
    expect(m.patientCount).toBe(2);
    expect(m.topBranches[0]).toEqual({ label: "Tejero", value: 2 });
    expect(m.treatmentFrequency[0]).toEqual({ label: "Diamond Peel", value: 2 });
    expect(m.staffActivity[0]).toEqual({ label: "Cruz", value: 2 });
    const roleLabels = m.staffByRole.map((d) => d.label).sort();
    expect(roleLabels).toEqual(["aesthetician", "encoder", "unknown"]);
    expect(m.branchComparison[0]).toEqual({ branch: "Tejero", treatments: 2, patients: 2 });
  });

  it("sums revenue by month and overall", () => {
    const m = buildAnalytics([
      record({
        invoices: [
          invoice({ amountPaid: "1000.00", dateUpdated: "2026-05-10" }),
          invoice({ amountPaid: "2500.50", dateUpdated: "2026-06-01" }),
          invoice({ amountPaid: "500.00", dateUpdated: "2026-06-20" }),
        ],
      }),
    ]);
    expect(m.totalRevenuePaid).toBe("4000.50");
    expect(m.revenueTrends).toEqual([
      { label: "2026-05", value: 1000 },
      { label: "2026-06", value: 3000.5 },
    ]);
  });

  it("computes package completion (completed vs in-progress, average percent)", () => {
    const m = buildAnalytics([
      record({
        treatments: [
          // Package A: 2 of 4 done → in progress, 50%.
          treatment({ packageName: "A", sessionsTotal: 4 }),
          treatment({ packageName: "A", sessionsTotal: 4 }),
          // Package B: 3 of 3 → completed, 100%.
          treatment({ packageName: "B", sessionsTotal: 3 }),
          treatment({ packageName: "B", sessionsTotal: 3 }),
          treatment({ packageName: "B", sessionsTotal: 3 }),
        ],
      }),
    ]);
    expect(m.packageCompletion.packages).toBe(2);
    expect(m.packageCompletion.completed).toBe(1);
    expect(m.packageCompletion.inProgress).toBe(1);
    expect(m.packageCompletion.averagePercent).toBe(75); // (50 + 100) / 2
  });

  it("buckets edit activity by target type", () => {
    const m = buildAnalytics([
      record({
        activity: [
          activity({ logName: "invoices", description: "Invoice updated" }),
          activity({ logName: "payments", description: "Payment created" }),
          activity({ logName: "treatment records", description: "Treatment edited" }),
          activity({ logName: "users", description: "User updated" }),
        ],
      }),
    ]);
    const byLabel = new Map(m.editActivityByTarget.map((d) => [d.label, d.value]));
    expect(byLabel.get("invoice")).toBe(1);
    expect(byLabel.get("payment")).toBe(1);
    expect(byLabel.get("treatment")).toBe(1);
    expect(byLabel.get("user")).toBe(1);
  });
});
