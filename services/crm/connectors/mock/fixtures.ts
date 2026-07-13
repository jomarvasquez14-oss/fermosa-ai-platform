import type { NormalizedCrmPatientRecord } from "@/services/crm/types";

/**
 * Mock CRM fixtures (Sprint 3.4) — entirely fictional, modeled on the real
 * CRM's observed shapes (CRM_DISCOVERY §1): package-scoped treatments,
 * per-service invoices with payments, field-level activity diffs.
 *
 * Scenario coverage (one patient each, plus the duplicate pair):
 *   c-1001 Maria Santos        normal: one treatment, paid invoice, clean log
 *   c-1002 Joyce Reyes         package with multiple sessions
 *   c-1003 Aljon Garcia        registered, NO treatments
 *   c-1004 Catherine Cruz (a)  ┐ duplicate names — findPatients must return
 *   c-1005 Catherine Cruz (b)  ┘ "ambiguous", never auto-pick
 *   c-1006 Kristine Torres     treatment present, invoice MISSING
 *   c-1007 Gerald Miranda      treatment + invoice, activity log EMPTY
 *   c-1008 Stephanie Rosales   DELETED treatment (visible only in activity)
 *   c-1009 Angela Bautista     EDITED treatment (field-level diffs in activity)
 */

export const FIXTURES_VERSION = "fixtures/v1";

type FixtureRecord = Omit<NormalizedCrmPatientRecord, "retrievedAt" | "connectorKind">;

const BRANCH_TEJERO = { crmBranchId: "1", name: "Fermosa Tejero", platformBranchId: null };
const BRANCH_IMUS = { crmBranchId: "2", name: "Fermosa Imus", platformBranchId: null };
const BRANCH_INDANG = { crmBranchId: "6", name: "Fermosa Indang", platformBranchId: null };

function patient(
  crmId: string,
  first: string,
  last: string,
  overrides: Partial<FixtureRecord["patient"]> = {}
): FixtureRecord["patient"] {
  return {
    crmId,
    fullName: `${last}, ${first}`,
    firstName: first,
    middleName: null,
    lastName: last,
    nickname: null,
    dateOfBirth: null,
    email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, "")}@example.test`,
    mobileNo: `0917${crmId.slice(2).padEnd(7, "0")}`,
    membershipType: "Regular",
    lastVisit: "2026-07-10",
    ...overrides,
  };
}

export const FIXTURE_RECORDS: readonly FixtureRecord[] = [
  {
    sourceRef: FIXTURES_VERSION,
    patient: patient("c-1001", "Maria", "Santos", { dateOfBirth: "1992-03-14" }),
    treatments: [
      {
        performedAt: "2026-07-10",
        branch: BRANCH_TEJERO,
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
        refNo: "INV-88101",
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
            receivedBy: "Front Desk A",
            referenceNo: null,
          },
        ],
      },
    ],
    activity: [
      {
        occurredAt: "2026-07-10T14:31:00Z",
        logName: "created",
        description: "Treatment record created",
        causedBy: "encoder.tejero",
        changes: null,
      },
    ],
  },
  {
    sourceRef: FIXTURES_VERSION,
    patient: patient("c-1002", "Joyce", "Reyes", { membershipType: "VIP" }),
    treatments: [1, 2, 3].map((session) => ({
      performedAt: `2026-07-0${session + 3}`,
      branch: BRANCH_IMUS,
      procedure: "Gluta Drip",
      packageName: "GLUTA DRIP 10 SESSION",
      sessionNumber: session,
      sessionsTotal: 10,
      promoCode: session === 1 ? "PROMO-JULY" : null,
      intensitySettings: null,
      performedBy: { name: "M. Lim", role: "aesthetician" },
      locked: false,
    })),
    invoices: [
      {
        refNo: "INV-88102",
        serviceName: "GLUTA DRIP 10 SESSION",
        amount: "12000.00",
        amountPaid: "6000.00",
        balance: "6000.00",
        status: "partial",
        dateUpdated: "2026-07-04",
        payments: [
          {
            paidAt: "2026-07-04",
            amount: "6000.00",
            mode: "GCash",
            receivedBy: "Front Desk B",
            referenceNo: "GC-55712",
          },
        ],
      },
    ],
    activity: [
      {
        occurredAt: "2026-07-04T10:02:00Z",
        logName: "created",
        description: "Availed service created",
        causedBy: "encoder.imus",
        changes: null,
      },
    ],
  },
  {
    sourceRef: FIXTURES_VERSION,
    // Registered but never treated — "logbook says treated, CRM says never" case.
    patient: patient("c-1003", "Aljon", "Garcia", { lastVisit: null }),
    treatments: [],
    invoices: [],
    activity: [
      {
        occurredAt: "2026-06-28T09:15:00Z",
        logName: "created",
        description: "Patient registered",
        causedBy: "frontdesk.tejero",
        changes: null,
      },
    ],
  },
  {
    sourceRef: FIXTURES_VERSION,
    patient: patient("c-1004", "Catherine", "Cruz", { dateOfBirth: "1988-11-02" }),
    treatments: [
      {
        performedAt: "2026-07-11",
        branch: BRANCH_TEJERO,
        procedure: "Hydrafacial",
        packageName: null,
        sessionNumber: null,
        sessionsTotal: null,
        promoCode: null,
        intensitySettings: null,
        performedBy: { name: "A. Bautista", role: "aesthetician" },
        locked: false,
      },
    ],
    invoices: [],
    activity: [],
  },
  {
    sourceRef: FIXTURES_VERSION,
    // Same display name as c-1004, different person: dob + mobile differ.
    patient: patient("c-1005", "Catherine", "Cruz", { dateOfBirth: "1995-06-21" }),
    treatments: [],
    invoices: [],
    activity: [],
  },
  {
    sourceRef: FIXTURES_VERSION,
    // Treatment exists, invoice missing — a matching-engine finding.
    patient: patient("c-1006", "Kristine", "Torres"),
    treatments: [
      {
        performedAt: "2026-07-09",
        branch: BRANCH_INDANG,
        procedure: "RF Slimming",
        packageName: null,
        sessionNumber: null,
        sessionsTotal: null,
        promoCode: null,
        intensitySettings: "Level 3",
        performedBy: { name: "K. Ramos", role: "aesthetician" },
        locked: false,
      },
    ],
    invoices: [],
    activity: [
      {
        occurredAt: "2026-07-09T16:40:00Z",
        logName: "created",
        description: "Treatment record created",
        causedBy: "encoder.indang",
        changes: null,
      },
    ],
  },
  {
    sourceRef: FIXTURES_VERSION,
    // Treatment + invoice, but the CRM recorded no activity for it.
    patient: patient("c-1007", "Gerald", "Miranda"),
    treatments: [
      {
        performedAt: "2026-07-08",
        branch: BRANCH_IMUS,
        procedure: "Carbon Laser",
        packageName: null,
        sessionNumber: null,
        sessionsTotal: null,
        promoCode: null,
        intensitySettings: null,
        performedBy: { name: "R. Villanueva", role: "unknown" },
        locked: false,
      },
    ],
    invoices: [
      {
        refNo: "INV-88107",
        serviceName: "Carbon Laser",
        amount: "2500.00",
        amountPaid: "2500.00",
        balance: "0.00",
        status: "paid",
        dateUpdated: "2026-07-08",
        payments: null,
      },
    ],
    activity: [],
  },
  {
    sourceRef: FIXTURES_VERSION,
    // DELETED treatment: gone from the profile, provable via activity log.
    patient: patient("c-1008", "Stephanie", "Rosales"),
    treatments: [],
    invoices: [],
    activity: [
      {
        occurredAt: "2026-07-07T11:20:00Z",
        logName: "created",
        description: "Treatment record created",
        causedBy: "encoder.tejero",
        changes: null,
      },
      {
        occurredAt: "2026-07-07T18:45:00Z",
        logName: "deleted",
        description: "Treatment record deleted",
        causedBy: "manager.tejero",
        changes: [
          { field: "deleted_at", oldValue: null, newValue: "2026-07-07 18:45:12" },
          { field: "service.name", oldValue: "Underarm Whitening", newValue: null },
        ],
      },
    ],
  },
  {
    sourceRef: FIXTURES_VERSION,
    // EDITED treatment: amount and service changed after the fact.
    patient: patient("c-1009", "Angela", "Bautista"),
    treatments: [
      {
        performedAt: "2026-07-06",
        branch: BRANCH_TEJERO,
        procedure: "Warts Removal",
        packageName: null,
        sessionNumber: null,
        sessionsTotal: null,
        promoCode: null,
        intensitySettings: null,
        performedBy: { name: "J. Cruz", role: "aesthetician" },
        locked: true,
      },
    ],
    invoices: [
      {
        refNo: "INV-88109",
        serviceName: "Warts Removal",
        amount: "800.00",
        amountPaid: "500.00",
        balance: "300.00",
        status: "partial",
        dateUpdated: "2026-07-07",
        payments: [
          {
            paidAt: "2026-07-06",
            amount: "500.00",
            mode: "Cash",
            receivedBy: "Front Desk A",
            referenceNo: null,
          },
        ],
      },
    ],
    activity: [
      {
        occurredAt: "2026-07-06T13:05:00Z",
        logName: "created",
        description: "Treatment record created",
        causedBy: "encoder.tejero",
        changes: null,
      },
      {
        occurredAt: "2026-07-07T09:12:00Z",
        logName: "updated",
        description: "Invoice updated",
        causedBy: "manager.tejero",
        changes: [
          { field: "amount_paid", oldValue: "800.00", newValue: "500.00" },
          { field: "service.name", oldValue: "Warts Removal x2", newValue: "Warts Removal" },
        ],
      },
    ],
  },
];

/**
 * Reserved query names that make the mock simulate INFRASTRUCTURE failures
 * (CRM_DISCOVERY §6) — usable from the dev page and tests.
 */
export const ERROR_TRIGGERS = {
  "trigger:unavailable": "CRM_UNAVAILABLE",
  "trigger:forbidden": "CRM_FORBIDDEN",
  "trigger:layout": "CRM_LAYOUT",
} as const;
