// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import { BUILT_IN_RULES } from "./rules";
import { createRuleEngine, RuleRegistry } from "./rule-engine";
import {
  duplicateInvoiceRule,
  duplicateTreatmentRule,
  EXTENDED_RULES,
  impossiblePackageProgressionRule,
  impossibleSessionSequenceRule,
  invoiceAfterTreatmentRule,
  invoiceWithoutTreatmentRule,
  packageOverCompletionRule,
  repeatedEditsRule,
  staffMismatchRule,
  suspiciousActivityFrequencyRule,
} from "./rules-extended";
import { DEFAULT_RULE_CONFIG } from "./types";
import type { ConfirmedEntry, RuleContext, RuleEngineConfig } from "./types";

/** Minimal CRM record builder — mirrors rules.test.ts's shape, kept local (separate test file). */
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

function entry(overrides: Partial<ConfirmedEntry> = {}): ConfirmedEntry {
  return {
    imageId: "img-1",
    pageNumber: 1,
    lineNumber: 1,
    patientName: "Maria Santos",
    treatment: "Diamond Peel",
    therapist: "J. Cruz",
    time: "2:30 PM",
    ...overrides,
  };
}

/** Minimal RuleContext builder (one crmRecord, default config, empty entries/resolutions). */
function ctx(
  overrides: {
    crmRecords?: NormalizedCrmPatientRecord[];
    config?: RuleEngineConfig;
  } = {}
): RuleContext {
  return {
    submission: { id: "sub-1", branchName: "Fermosa Tejero", auditDate: "2026-07-10" },
    entries: [],
    resolutions: [],
    crmRecords: overrides.crmRecords ?? [record()],
    config: overrides.config ?? DEFAULT_RULE_CONFIG,
  };
}

describe("invoice-after-treatment", () => {
  it("warns when the invoice predates the treatment it bills", () => {
    const rec = record({
      treatments: [treatment({ procedure: "Diamond Peel", performedAt: "2026-07-10" })],
      invoices: [invoice({ serviceName: "Diamond Peel", dateUpdated: "2026-07-05" })],
    });
    const results = invoiceAfterTreatmentRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "warning" && r.finding?.category === "MISMATCHED_FIELD")
    ).toBe(true);
  });

  it("passes when the invoice is dated on/after the treatment", () => {
    const rec = record({
      treatments: [treatment({ procedure: "Diamond Peel", performedAt: "2026-07-10" })],
      invoices: [invoice({ serviceName: "Diamond Peel", dateUpdated: "2026-07-10" })],
    });
    const results = invoiceAfterTreatmentRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(results.every((r) => r.outcome === "pass")).toBe(true);
  });
});

describe("invoice-without-treatment", () => {
  it("fails when no treatment matches the invoice's service", () => {
    const rec = record({
      treatments: [treatment({ procedure: "Diamond Peel" })],
      invoices: [invoice({ serviceName: "Gluta Drip IV" })],
    });
    const results = invoiceWithoutTreatmentRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "fail" && r.finding?.category === "MISSING_IN_LOGBOOK")
    ).toBe(true);
  });

  it("passes when a treatment matches the invoice's service", () => {
    const rec = record({
      treatments: [treatment({ procedure: "Diamond Peel" })],
      invoices: [invoice({ serviceName: "Diamond Peel" })],
    });
    const results = invoiceWithoutTreatmentRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(results.every((r) => r.outcome === "pass")).toBe(true);
  });
});

describe("duplicate-invoice", () => {
  it("warns on invoices sharing a refNo", () => {
    const rec = record({
      invoices: [
        invoice({ refNo: "INV-1" }),
        invoice({ refNo: "INV-1", serviceName: "Different Service" }),
      ],
    });
    const results = duplicateInvoiceRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "warning" && r.finding?.category === "DUPLICATE_ENTRY")
    ).toBe(true);
  });

  it("warns on invoices sharing (service, amount, date) with different refNos", () => {
    const rec = record({
      invoices: [
        invoice({ refNo: "INV-1" }),
        invoice({ refNo: "INV-2" }), // same serviceName/amount/dateUpdated as INV-1
      ],
    });
    const results = duplicateInvoiceRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "warning" && r.finding?.category === "DUPLICATE_ENTRY")
    ).toBe(true);
  });

  it("passes when invoices are distinct", () => {
    const rec = record({
      invoices: [
        invoice({ refNo: "INV-1" }),
        invoice({ refNo: "INV-2", serviceName: "Gluta Drip", amount: "900.00" }),
      ],
    });
    const results = duplicateInvoiceRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(results.every((r) => r.outcome === "pass")).toBe(true);
  });
});

describe("duplicate-treatment", () => {
  it("warns on treatments sharing procedure/date/branch", () => {
    const rec = record({ treatments: [treatment(), treatment()] });
    const results = duplicateTreatmentRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "warning" && r.finding?.category === "DUPLICATE_ENTRY")
    ).toBe(true);
  });

  it("passes when treatments differ", () => {
    const rec = record({
      treatments: [treatment(), treatment({ procedure: "Gluta Drip", performedAt: "2026-07-11" })],
    });
    const results = duplicateTreatmentRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(results.every((r) => r.outcome === "pass")).toBe(true);
  });
});

describe("impossible-session-sequence", () => {
  it("warns when a later-dated session has a lower or equal session number", () => {
    const rec = record({
      treatments: [
        treatment({
          packageName: "Slimming Package",
          performedAt: "2026-07-01",
          sessionNumber: 2,
          sessionsTotal: 6,
        }),
        treatment({
          packageName: "Slimming Package",
          performedAt: "2026-07-05",
          sessionNumber: 1,
          sessionsTotal: 6,
        }),
      ],
    });
    const results = impossibleSessionSequenceRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "warning" && r.finding?.category === "MISMATCHED_FIELD")
    ).toBe(true);
  });

  it("passes when session numbers increase in date order", () => {
    const rec = record({
      treatments: [
        treatment({
          packageName: "Slimming Package",
          performedAt: "2026-07-01",
          sessionNumber: 1,
          sessionsTotal: 6,
        }),
        treatment({
          packageName: "Slimming Package",
          performedAt: "2026-07-05",
          sessionNumber: 2,
          sessionsTotal: 6,
        }),
      ],
    });
    const results = impossibleSessionSequenceRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(results.every((r) => r.outcome === "pass")).toBe(true);
  });
});

describe("impossible-package-progression", () => {
  it("warns when sessionsTotal differs across a package's treatments", () => {
    const rec = record({
      treatments: [
        treatment({ packageName: "Slimming Package", performedAt: "2026-07-01", sessionsTotal: 6 }),
        treatment({ packageName: "Slimming Package", performedAt: "2026-07-05", sessionsTotal: 8 }),
      ],
    });
    const results = impossiblePackageProgressionRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "warning" && r.finding?.category === "RECORD_EDITED")
    ).toBe(true);
  });

  it("passes when sessionsTotal is consistent", () => {
    const rec = record({
      treatments: [
        treatment({ packageName: "Slimming Package", performedAt: "2026-07-01", sessionsTotal: 6 }),
        treatment({ packageName: "Slimming Package", performedAt: "2026-07-05", sessionsTotal: 6 }),
      ],
    });
    const results = impossiblePackageProgressionRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(results.every((r) => r.outcome === "pass")).toBe(true);
  });
});

describe("repeated-edits", () => {
  it("fails when updated-activity count meets the configured threshold", () => {
    const rec = record({ activity: [activityEvent(), activityEvent(), activityEvent()] });
    const results = repeatedEditsRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "fail" && r.finding?.category === "RECORD_EDITED")
    ).toBe(true);
  });

  it("passes when edits are below the threshold", () => {
    const rec = record({ activity: [activityEvent()] });
    const results = repeatedEditsRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(results.every((r) => r.outcome === "pass")).toBe(true);
  });
});

describe("suspicious-activity-frequency", () => {
  it("warns when activity volume exceeds the configured threshold", () => {
    const rec = record({
      activity: Array.from({ length: 11 }, (_, index) =>
        activityEvent({ occurredAt: `2026-07-${String((index % 27) + 1).padStart(2, "0")}T10:00:00Z` })
      ),
    });
    const results = suspiciousActivityFrequencyRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "warning" && r.finding?.category === "OTHER")
    ).toBe(true);
  });

  it("passes when activity volume is within the threshold", () => {
    const rec = record({ activity: [activityEvent()] });
    const results = suspiciousActivityFrequencyRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(results.every((r) => r.outcome === "pass")).toBe(true);
  });
});

describe("staff-mismatch", () => {
  it("warns when a package's sessions are attributed to different staff", () => {
    const rec = record({
      treatments: [
        treatment({
          packageName: "Facial Package",
          performedBy: { name: "J. Cruz", role: "aesthetician" },
        }),
        treatment({
          packageName: "Facial Package",
          performedAt: "2026-07-11",
          performedBy: { name: "M. Lim", role: "aesthetician" },
        }),
      ],
    });
    const results = staffMismatchRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "warning" && r.finding?.category === "MISMATCHED_FIELD")
    ).toBe(true);
  });

  it("passes when one staff member performs all sessions", () => {
    const rec = record({
      treatments: [
        treatment({ packageName: "Facial Package" }),
        treatment({ packageName: "Facial Package", performedAt: "2026-07-11" }),
      ],
    });
    const results = staffMismatchRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(results.every((r) => r.outcome === "pass")).toBe(true);
  });
});

describe("package-over-completion", () => {
  it("fails when sessionNumber exceeds sessionsTotal", () => {
    const rec = record({
      treatments: [
        treatment({ packageName: "Slimming Package", sessionNumber: 8, sessionsTotal: 6 }),
      ],
    });
    const results = packageOverCompletionRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(
      results.some((r) => r.outcome === "fail" && r.finding?.category === "MISMATCHED_FIELD")
    ).toBe(true);
  });

  it("passes when sessionNumber is within the package total", () => {
    const rec = record({
      treatments: [
        treatment({ packageName: "Slimming Package", sessionNumber: 3, sessionsTotal: 6 }),
      ],
    });
    const results = packageOverCompletionRule.evaluate(ctx({ crmRecords: [rec] }));
    expect(results.every((r) => r.outcome === "pass")).toBe(true);
  });
});

describe("registration", () => {
  it("registers all ten new rules alongside the original thirteen with no id collisions", () => {
    const registry = new RuleRegistry();
    expect(() => {
      for (const rule of [...BUILT_IN_RULES, ...EXTENDED_RULES]) registry.register(rule);
    }).not.toThrow();

    const ids = registry.all().map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);

    expect(EXTENDED_RULES).toHaveLength(10);
    for (const rule of EXTENDED_RULES) expect(ids).toContain(rule.id);
    for (const rule of BUILT_IN_RULES) expect(ids).toContain(rule.id);
  });

  it("createRuleEngine() wires the extended rules in without throwing", () => {
    expect(() => createRuleEngine()).not.toThrow();
  });
});

describe("performance", () => {
  it("full engine (built-in + extended) evaluates 1000 entries in under 300ms", () => {
    const records = Array.from({ length: 40 }, (_, index) =>
      record({
        patient: {
          crmId: `c-${index}`,
          fullName: `Patient ${index}`,
          firstName: "Patient",
          middleName: null,
          lastName: `${index}`,
          nickname: null,
          dateOfBirth: null,
          email: null,
          mobileNo: null,
          membershipType: null,
          lastVisit: null,
        },
        treatments: [
          treatment({ packageName: "Package A", performedAt: "2026-07-10", sessionNumber: 1, sessionsTotal: 6 }),
          treatment({ packageName: "Package A", performedAt: "2026-07-11", sessionNumber: 2, sessionsTotal: 6 }),
        ],
        invoices: [
          invoice({ refNo: `INV-A-${index}`, serviceName: "Diamond Peel", dateUpdated: "2026-07-10" }),
          invoice({ refNo: `INV-B-${index}`, serviceName: "Package A", dateUpdated: "2026-07-11" }),
        ],
        activity: [activityEvent(), activityEvent({ logName: "viewed" })],
      })
    );
    const entries = Array.from({ length: 1000 }, (_, index) =>
      entry({
        lineNumber: index + 1,
        patientName: `Patient ${index % 40}`,
        treatment: index % 3 === 0 ? "Gluta Drip" : "Diamond Peel",
      })
    );
    const resolutions = entries.map((row) => ({
      entryKey: `1:${row.lineNumber}`,
      outcome: "found" as const,
      crmPatientId: `c-${(row.lineNumber - 1) % 40}`,
    }));

    const report = createRuleEngine().evaluate({
      submission: { id: "sub-perf", branchName: "Fermosa Tejero", auditDate: "2026-07-10" },
      entries,
      resolutions,
      crmRecords: records,
    });

    expect(report.durationMs).toBeLessThan(300);
    expect(report.results.length).toBeGreaterThan(1000);
  });
});
