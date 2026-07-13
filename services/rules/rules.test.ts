// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import { branchScore, createRuleEngine } from "./rule-engine";
import { similarity } from "./similarity";
import type { ConfirmedEntry, PatientResolution } from "./types";

/** Minimal CRM record builder for rule scenarios. */
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
    treatments: [
      {
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
      },
    ],
    invoices: [
      {
        refNo: "INV-1",
        serviceName: "Diamond Peel",
        amount: "1500.00",
        amountPaid: "1500.00",
        balance: "0.00",
        status: "paid",
        dateUpdated: "2026-07-10",
        payments: [
          {
            paidAt: "2026-07-10",
            amount: "1500.00",
            mode: "Cash",
            receivedBy: "FD",
            referenceNo: null,
          },
        ],
      },
    ],
    activity: [],
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

const found: PatientResolution = { entryKey: "1:1", outcome: "found", crmPatientId: "c-1" };

function evaluate(input: {
  entries?: ConfirmedEntry[];
  resolutions?: PatientResolution[];
  crmRecords?: NormalizedCrmPatientRecord[];
  config?: Parameters<typeof createRuleEngine>[0];
}) {
  return createRuleEngine(input.config).evaluate({
    submission: { id: "sub-1", branchName: "Fermosa Tejero", auditDate: "2026-07-10" },
    entries: input.entries ?? [entry()],
    resolutions: input.resolutions ?? [found],
    crmRecords: input.crmRecords ?? [record()],
  });
}

describe("individual rules", () => {
  it("clean data produces zero findings and a perfect score", () => {
    const report = evaluate({});
    expect(report.findings).toEqual([]);
    expect(report.scores).toEqual({ riskScore: 0, submissionScore: 100 });
  });

  it("patient-name flags dissimilar names", () => {
    const report = evaluate({ entries: [entry({ patientName: "Karla Reyes" })] });
    expect(report.findings.some((f) => f.title.startsWith("Patient name differs"))).toBe(true);
  });

  it("treatment flags a different same-day procedure", () => {
    const report = evaluate({ entries: [entry({ treatment: "Gluta Drip" })] });
    expect(report.findings.some((f) => f.title.startsWith("Treatment differs"))).toBe(true);
  });

  it("therapist flags a different performer", () => {
    const report = evaluate({ entries: [entry({ therapist: "M. Lim" })] });
    expect(report.findings.some((f) => f.title.startsWith("Therapist differs"))).toBe(true);
  });

  it("invoice flags broken arithmetic and paid-with-balance", () => {
    const bad = record();
    bad.invoices[0]!.balance = "100.00"; // 1500 ≠ 1500 + 100
    const report = evaluate({ crmRecords: [bad] });
    expect(report.findings.some((f) => f.title.includes("amounts are inconsistent"))).toBe(true);
  });

  it("payment flags payments that do not sum to amount paid", () => {
    const bad = record();
    bad.invoices[0]!.payments = [
      {
        paidAt: "2026-07-10",
        amount: "1000.00",
        mode: "Cash",
        receivedBy: "FD",
        referenceNo: null,
      },
    ];
    const report = evaluate({ crmRecords: [bad] });
    expect(report.findings.some((f) => f.title.includes("do not sum"))).toBe(true);
  });

  it("branch flags treatments encoded under another branch", () => {
    const bad = record();
    bad.treatments[0]!.branch = { crmBranchId: "28", name: "Fermosa Imus", platformBranchId: null };
    const report = evaluate({ crmRecords: [bad] });
    expect(report.findings.some((f) => f.title.includes("different branch"))).toBe(true);
  });

  it("date flags a matching treatment dated off the audit date", () => {
    const bad = record();
    bad.treatments[0]!.performedAt = "2026-07-08";
    const report = evaluate({ crmRecords: [bad] });
    expect(report.findings.some((f) => f.title.includes("dated differently"))).toBe(true);
    // and missing-crm-record ALSO fires (no same-day record) — the money case.
    expect(report.findings.some((f) => f.category === "MISSING_IN_CRM")).toBe(true);
  });

  it("duplicate-patient requires review on ambiguity", () => {
    const report = evaluate({
      resolutions: [
        { entryKey: "1:1", outcome: "ambiguous", crmPatientId: null, candidateIds: ["c-1", "c-2"] },
      ],
      crmRecords: [],
    });
    expect(report.results.some((r) => r.outcome === "review-required")).toBe(true);
    expect(report.findings.some((f) => f.category === "AMBIGUOUS_PATIENT")).toBe(true);
  });

  it("deleted-treatment is CRITICAL", () => {
    const bad = record({
      activity: [
        {
          occurredAt: "2026-07-10T18:45:00Z",
          logName: "deleted",
          description: "Treatment record deleted",
          causedBy: "manager.tejero",
          changes: null,
        },
      ],
    });
    const finding = evaluate({ crmRecords: [bad] }).findings.find(
      (f) => f.category === "RECORD_DELETED"
    );
    expect(finding?.severity).toBe("CRITICAL");
  });

  it("edited-treatment flags sensitive field diffs with old→new detail", () => {
    const bad = record({
      activity: [
        {
          occurredAt: "2026-07-11T09:00:00Z",
          logName: "updated",
          description: "Invoice updated",
          causedBy: "manager.tejero",
          changes: [{ field: "amount_paid", oldValue: "1500.00", newValue: "900.00" }],
        },
      ],
    });
    const finding = evaluate({ crmRecords: [bad] }).findings.find(
      (f) => f.category === "RECORD_EDITED"
    );
    expect(finding).toBeDefined();
    expect(finding!.detail).toContain("1500.00 → 900.00");
  });

  it("missing-crm-record: not-found patient → UNMATCHED_PATIENT; no same-day record → MISSING_IN_CRM (CRITICAL)", () => {
    const notFound = evaluate({
      resolutions: [{ entryKey: "1:1", outcome: "not-found", crmPatientId: null }],
      crmRecords: [],
    });
    expect(notFound.findings.some((f) => f.category === "UNMATCHED_PATIENT")).toBe(true);

    const noTreatment = evaluate({ crmRecords: [record({ treatments: [] })] });
    const missing = noTreatment.findings.find((f) => f.category === "MISSING_IN_CRM");
    expect(missing?.severity).toBe("CRITICAL");
  });

  it("missing-invoice flags uninvoiced same-day treatments", () => {
    const bad = record({ invoices: [] });
    const report = evaluate({ crmRecords: [bad] });
    expect(report.findings.some((f) => f.category === "MISSING_INVOICE")).toBe(true);
  });

  it("duplicate-entry flags identical logbook lines", () => {
    const report = evaluate({
      entries: [entry(), entry({ lineNumber: 4 })],
      resolutions: [found, { ...found, entryKey: "1:4" }],
    });
    expect(report.findings.some((f) => f.category === "DUPLICATE_ENTRY")).toBe(true);
  });
});

describe("combinations, configuration, scoring", () => {
  it("a rotten submission accumulates findings from many rules at once", () => {
    const bad = record({
      treatments: [],
      invoices: [],
      activity: [
        {
          occurredAt: "2026-07-10T18:45:00Z",
          logName: "deleted",
          description: "Treatment record deleted",
          causedBy: "manager",
          changes: null,
        },
      ],
    });
    const report = evaluate({
      entries: [entry(), entry({ lineNumber: 2, patientName: "Nobody Known" })],
      resolutions: [found, { entryKey: "1:2", outcome: "not-found", crmPatientId: null }],
      crmRecords: [bad],
    });
    const categories = new Set(report.findings.map((f) => f.category));
    expect(categories).toContain("MISSING_IN_CRM");
    expect(categories).toContain("UNMATCHED_PATIENT");
    expect(categories).toContain("RECORD_DELETED");
    expect(report.scores.riskScore).toBeGreaterThan(30);
    expect(report.scores.submissionScore).toBe(100 - report.scores.riskScore);
  });

  it("rules can be disabled and re-weighted via configuration", () => {
    const bad = record({ invoices: [] });
    const disabled = evaluate({
      crmRecords: [bad],
      config: { rules: { "missing-invoice": { enabled: false } } },
    });
    expect(disabled.findings.some((f) => f.category === "MISSING_INVOICE")).toBe(false);

    const light = evaluate({ crmRecords: [bad] }).scores.riskScore;
    const heavy = evaluate({
      crmRecords: [bad],
      config: { rules: { "missing-invoice": { weight: 10 } } },
    }).scores.riskScore;
    expect(heavy).toBeGreaterThan(light);
  });

  it("name tolerance threshold is configurable", () => {
    const entries = [entry({ patientName: "Santos, Mariaa" })]; // one typo, same order
    const strict = evaluate({ entries, config: { nameSimilarityThreshold: 0.99 } });
    const lenient = evaluate({ entries, config: { nameSimilarityThreshold: 0.8 } });
    expect(strict.findings.some((f) => f.title.startsWith("Patient name differs"))).toBe(true);
    expect(lenient.findings.some((f) => f.title.startsWith("Patient name differs"))).toBe(false);
  });

  it("risk score caps at 100 and branchScore averages submissions", () => {
    const horror = evaluate({
      entries: Array.from({ length: 30 }, (_, index) =>
        entry({ lineNumber: index + 1, patientName: `Ghost Patient ${index}` })
      ),
      resolutions: Array.from({ length: 30 }, (_, index) => ({
        entryKey: `1:${index + 1}`,
        outcome: "not-found" as const,
        crmPatientId: null,
      })),
      crmRecords: [],
    });
    expect(horror.scores.riskScore).toBe(100);
    expect(branchScore([100, 50])).toBe(75);
    expect(branchScore([])).toBeNull();
  });

  it("similarity handles reordered and slightly misspelled names", () => {
    expect(similarity("Santos, Maria", "Maria Santos")).toBeGreaterThanOrEqual(0.95);
    expect(similarity("Diamond Peel", "Diamond Pel")).toBeGreaterThan(0.85);
    expect(similarity("Maria Santos", "Gerald Miranda")).toBeLessThan(0.5);
  });

  it("performance: 1,000 entries across 40 patients evaluate in under 300ms", () => {
    const records = Array.from({ length: 40 }, (_, index) => {
      const base = record();
      base.patient = { ...base.patient, crmId: `c-${index}`, fullName: `Patient ${index}` };
      return base;
    });
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
