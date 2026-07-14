// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import { BUILT_IN_RULES } from "./rules";
import { EXTENDED_RULES } from "./rules-extended";
import { createRuleEngine, RuleRegistry } from "./rule-engine";
import {
  EXTENDED_RULES_2,
  crossBranchInconsistencyRule,
  invoiceChronologyAnomalyRule,
  largeBillingAdjustmentRule,
  repeatedCancellationsRule,
  repeatedDeletionsRule,
  repeatedInvoiceCorrectionsRule,
  unusualActivityDensityRule,
} from "./rules-extended-2";
import { DEFAULT_RULE_CONFIG } from "./types";
import type { ConfirmedEntry, RuleContext, RuleEngineConfig } from "./types";

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

function treatment(
  overrides: Partial<NormalizedCrmPatientRecord["treatments"][number]> = {}
): NormalizedCrmPatientRecord["treatments"][number] {
  return {
    performedAt: "2026-07-10",
    branch: { crmBranchId: "26", name: "Fermosa Tejero", platformBranchId: null },
    procedure: "Diamond Peel",
    packageName: null,
    sessionNumber: null,
    sessionsTotal: null,
    promoCode: null,
    intensitySettings: null,
    performedBy: { name: "J. Cruz", role: "aesthetician" },
    locked: false,
    ...overrides,
  };
}

function invoice(
  overrides: Partial<NormalizedCrmPatientRecord["invoices"][number]> = {}
): NormalizedCrmPatientRecord["invoices"][number] {
  return {
    refNo: "INV-1",
    serviceName: "Diamond Peel",
    amount: "1500.00",
    amountPaid: "1500.00",
    balance: "0.00",
    status: "paid",
    dateUpdated: "2026-07-10",
    payments: null,
    ...overrides,
  };
}

function activityEvent(
  overrides: Partial<NormalizedCrmPatientRecord["activity"][number]> = {}
): NormalizedCrmPatientRecord["activity"][number] {
  return {
    occurredAt: "2026-07-10T10:00:00Z",
    logName: "updated",
    description: "Record updated",
    causedBy: "encoder.1",
    changes: null,
    ...overrides,
  };
}

function ctx(
  overrides: { crmRecords?: NormalizedCrmPatientRecord[]; config?: RuleEngineConfig } = {}
): RuleContext {
  return {
    submission: { id: "sub-1", branchName: "Fermosa Tejero", auditDate: "2026-07-10" },
    entries: [],
    resolutions: [],
    crmRecords: overrides.crmRecords ?? [record()],
    config: overrides.config ?? DEFAULT_RULE_CONFIG,
  };
}

const findings = (results: { outcome: string }[]) => results.filter((r) => r.outcome !== "pass");

describe("repeated-cancellations", () => {
  it("fails at or above the threshold", () => {
    const rec = record({
      activity: [
        activityEvent({ logName: "invoices", description: "Invoice cancelled" }),
        activityEvent({ description: "Payment voided" }),
      ],
    });
    const results = repeatedCancellationsRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(findings(results)).toHaveLength(1);
    expect(results[0]?.finding?.severity).toBe("HIGH");
  });

  it("passes below the threshold", () => {
    const rec = record({ activity: [activityEvent({ description: "Invoice cancelled" })] });
    expect(findings(repeatedCancellationsRule.evaluate(ctx({ crmRecords: [rec] })))).toEqual([]);
  });
});

describe("repeated-deletions", () => {
  it("flags CRITICAL when deletions reach the threshold", () => {
    const rec = record({
      activity: [
        activityEvent({ description: "Treatment deleted" }),
        activityEvent({ logName: "invoice items", description: "Item removed" }),
      ],
    });
    const results = repeatedDeletionsRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(findings(results)).toHaveLength(1);
    expect(results[0]?.finding?.category).toBe("RECORD_DELETED");
    expect(results[0]?.finding?.severity).toBe("CRITICAL");
  });

  it("does not confuse an update for a deletion", () => {
    const rec = record({ activity: [activityEvent({ description: "Record updated" }), activityEvent()] });
    expect(findings(repeatedDeletionsRule.evaluate(ctx({ crmRecords: [rec] })))).toEqual([]);
  });
});

describe("repeated-invoice-corrections", () => {
  it("counts money-field edits and bare invoice updates", () => {
    const rec = record({
      activity: [
        activityEvent({
          logName: "invoices",
          description: "Invoice updated",
          changes: [{ field: "amount", oldValue: "1500.00", newValue: "1800.00" }],
        }),
        activityEvent({ logName: "payments", description: "Payment updated" }),
      ],
    });
    const results = repeatedInvoiceCorrectionsRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(findings(results)).toHaveLength(1);
    expect(results[0]?.finding?.title).toMatch(/invoice corrections/i);
  });

  it("ignores non-invoice updates", () => {
    const rec = record({
      activity: [
        activityEvent({ logName: "users", description: "User updated" }),
        activityEvent({ logName: "users", description: "User updated" }),
      ],
    });
    expect(findings(repeatedInvoiceCorrectionsRule.evaluate(ctx({ crmRecords: [rec] })))).toEqual([]);
  });
});

describe("large-billing-adjustment", () => {
  it("fails when a money field changes beyond the configured amount", () => {
    const rec = record({
      activity: [
        activityEvent({
          description: "Invoice updated",
          changes: [{ field: "amount_paid", oldValue: "1,000.00", newValue: "8,500.00" }],
        }),
      ],
    });
    const results = largeBillingAdjustmentRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(findings(results)).toHaveLength(1);
    expect(results[0]?.finding?.actualValue).toMatch(/7500/);
  });

  it("passes a small adjustment and a non-money field", () => {
    const rec = record({
      activity: [
        activityEvent({ changes: [{ field: "amount", oldValue: "1000", newValue: "1100" }] }),
        activityEvent({ changes: [{ field: "remarks", oldValue: "a", newValue: "b" }] }),
      ],
    });
    expect(findings(largeBillingAdjustmentRule.evaluate(ctx({ crmRecords: [rec] })))).toEqual([]);
  });
});

describe("unusual-activity-density", () => {
  it("warns when a burst lands in one minute (distinct from total volume)", () => {
    const rec = record({
      activity: Array.from({ length: 5 }, (_, i) =>
        activityEvent({ occurredAt: `2026-07-10T10:00:${String(i).padStart(2, "0")}` })
      ),
    });
    const results = unusualActivityDensityRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(findings(results)).toHaveLength(1);
    expect(results[0]?.finding?.title).toMatch(/burst/i);
  });

  it("passes when the same count is spread across minutes", () => {
    const rec = record({
      activity: Array.from({ length: 5 }, (_, i) =>
        activityEvent({ occurredAt: `2026-07-10T10:${String(i * 5).padStart(2, "0")}:00` })
      ),
    });
    expect(findings(unusualActivityDensityRule.evaluate(ctx({ crmRecords: [rec] })))).toEqual([]);
  });
});

describe("cross-branch-inconsistency", () => {
  it("warns when a package spans two branches", () => {
    const rec = record({
      treatments: [
        treatment({ packageName: "Laser 5+1", branch: { crmBranchId: "26", name: "Fermosa Tejero", platformBranchId: null }, performedAt: "2026-07-01" }),
        treatment({ packageName: "Laser 5+1", branch: { crmBranchId: "27", name: "Fermosa Imus", platformBranchId: null }, performedAt: "2026-07-08" }),
      ],
    });
    const results = crossBranchInconsistencyRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(findings(results)).toHaveLength(1);
    expect(results[0]?.finding?.detail).toMatch(/Fermosa Tejero|Fermosa Imus/);
  });

  it("warns when one day has treatments at two branches", () => {
    const rec = record({
      treatments: [
        treatment({ performedAt: "2026-07-10", branch: { crmBranchId: "26", name: "Fermosa Tejero", platformBranchId: null } }),
        treatment({ performedAt: "2026-07-10", branch: { crmBranchId: "27", name: "Fermosa Imus", platformBranchId: null } }),
      ],
    });
    expect(findings(crossBranchInconsistencyRule.evaluate(ctx({ crmRecords: [rec] })))).toHaveLength(1);
  });

  it("passes a single-branch package", () => {
    const rec = record({
      treatments: [
        treatment({ packageName: "Laser 5+1", performedAt: "2026-07-01" }),
        treatment({ packageName: "Laser 5+1", performedAt: "2026-07-08" }),
      ],
    });
    expect(findings(crossBranchInconsistencyRule.evaluate(ctx({ crmRecords: [rec] })))).toEqual([]);
  });
});

describe("invoice-chronology-anomaly", () => {
  it("warns when a higher ref number is dated earlier", () => {
    const rec = record({
      invoices: [
        invoice({ refNo: "INV-100", dateUpdated: "2026-07-10" }),
        invoice({ refNo: "INV-101", dateUpdated: "2026-07-05" }),
      ],
    });
    const results = invoiceChronologyAnomalyRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(findings(results)).toHaveLength(1);
    expect(results[0]?.finding?.title).toMatch(/chronology/i);
  });

  it("passes monotonic reference numbers/dates", () => {
    const rec = record({
      invoices: [
        invoice({ refNo: "INV-100", dateUpdated: "2026-07-05" }),
        invoice({ refNo: "INV-101", dateUpdated: "2026-07-10" }),
      ],
    });
    expect(findings(invoiceChronologyAnomalyRule.evaluate(ctx({ crmRecords: [rec] })))).toEqual([]);
  });
});

describe("registration + no duplicate ids", () => {
  it("EXTENDED_RULES_2 holds the seven new rules with unique ids across all rule sets", () => {
    expect(EXTENDED_RULES_2).toHaveLength(7);
    const allIds = [...BUILT_IN_RULES, ...EXTENDED_RULES, ...EXTENDED_RULES_2].map((r) => r.id);
    expect(new Set(allIds).size).toBe(allIds.length); // no id collisions
    const registry = new RuleRegistry();
    for (const rule of [...BUILT_IN_RULES, ...EXTENDED_RULES, ...EXTENDED_RULES_2]) {
      registry.register(rule);
    }
    expect(registry.all().length).toBe(allIds.length);
  });

  it("createRuleEngine() actually wires every extended-2 rule (catches a dropped registration)", () => {
    // A record that trips several extended-2 rules at once.
    const rec = record({
      treatments: [
        treatment({ packageName: "P", performedAt: "2026-07-10", branch: { crmBranchId: "26", name: "Fermosa Tejero", platformBranchId: null } }),
        treatment({ packageName: "P", performedAt: "2026-07-10", branch: { crmBranchId: "27", name: "Fermosa Imus", platformBranchId: null } }),
      ],
      invoices: [
        invoice({ refNo: "INV-100", dateUpdated: "2026-07-10" }),
        invoice({ refNo: "INV-101", dateUpdated: "2026-07-01" }),
      ],
      activity: [
        activityEvent({ description: "Invoice deleted" }),
        activityEvent({ description: "Payment deleted" }),
      ],
    });
    const report = createRuleEngine().evaluate({
      submission: { id: "s", branchName: "Fermosa Tejero", auditDate: "2026-07-10" },
      entries: [],
      resolutions: [],
      crmRecords: [rec],
    });
    const ids = new Set(report.results.map((r) => r.ruleId));
    for (const rule of EXTENDED_RULES_2) expect(ids.has(rule.id)).toBe(true);
  });
});

describe("performance — full engine with extended-2", () => {
  function bigRecord(seed: number): NormalizedCrmPatientRecord {
    return record({
      patient: { ...record().patient, crmId: `c-${seed}` },
      treatments: [treatment({ performedAt: "2026-07-10" })],
      invoices: [invoice({ refNo: `INV-${seed}` })],
      activity: [activityEvent(), activityEvent({ description: "Invoice updated", changes: [{ field: "amount", oldValue: "1", newValue: "2" }] })],
    });
  }

  it("evaluates 1000 records across all 30 rules in under 300ms", () => {
    const entries: ConfirmedEntry[] = [];
    const crmRecords = Array.from({ length: 1000 }, (_, i) => bigRecord(i));
    const report = createRuleEngine().evaluate({
      submission: { id: "s", branchName: "Fermosa Tejero", auditDate: "2026-07-10" },
      entries,
      resolutions: [],
      crmRecords,
    });
    expect(report.durationMs).toBeLessThan(300);
    expect(report.results.length).toBeGreaterThan(1000);
  });
});
