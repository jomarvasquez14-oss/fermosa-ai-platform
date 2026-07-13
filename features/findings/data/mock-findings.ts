import type { FindingView } from "@/components/findings";

/**
 * Deterministic mock findings (Sprint 3.5) — the shapes future producers will
 * emit, one per finding category, aligned with the mock CRM fixture
 * scenarios (services/crm/connectors/mock/fixtures.ts) so the whole story
 * hangs together. Replaced by real AuditFinding rows when producers land.
 */
export const MOCK_FINDINGS: readonly FindingView[] = [
  {
    id: "f-001",
    category: "MISSING_IN_CRM",
    severity: "CRITICAL",
    status: "OPEN",
    source: "RULE_ENGINE",
    submissionId: "mock-sub-1",
    branchName: "Fermosa Tejero",
    auditDate: "2026-07-10",
    title: "Logbook treatment has no CRM record — possible unrecorded sale",
    detail:
      "Logbook page 1, line 4 records an RF Slimming session for a patient at 2:15 PM, but CRM discovery found no treatment record for this patient on the audit date. Treatments must be encoded on the day they are performed.",
    recommendation:
      "Ask the branch to explain the missing encoding. If the treatment happened, it must be encoded and invoiced retroactively with a manager's note.",
    expectedValue: "CRM treatment record on 2026-07-10",
    actualValue: "No CRM record found",
    evidence: [
      { type: "logbook-field", imageId: "img-a1", pageNumber: 1, lineNumber: 4, field: null },
      {
        type: "crm-record",
        crmPatientId: "c-1003",
        refNo: null,
        description: "Patient profile shows no treatments on the audit date",
      },
    ],
    confidence: 0.97,
    createdAt: "2026-07-13T09:12:00Z",
  },
  {
    id: "f-002",
    category: "MISSING_INVOICE",
    severity: "HIGH",
    status: "OPEN",
    source: "CRM_DISCOVERY",
    submissionId: "mock-sub-1",
    branchName: "Fermosa Indang",
    auditDate: "2026-07-09",
    title: "Treatment encoded but never invoiced",
    detail:
      "The CRM shows an RF Slimming treatment encoded on 2026-07-09, but no invoice exists for it. Invoices are generated after treatment encoding — a treatment without one means revenue was never billed.",
    recommendation:
      "Generate the missing invoice or document why the treatment was free of charge.",
    expectedValue: "Invoice for RF Slimming (2026-07-09)",
    actualValue: "No invoice on record",
    evidence: [
      {
        type: "crm-record",
        crmPatientId: "c-1006",
        refNo: null,
        description: "Treatment record dated 2026-07-09 with empty invoice list",
      },
    ],
    confidence: 0.94,
    createdAt: "2026-07-13T09:12:10Z",
  },
  {
    id: "f-003",
    category: "RECORD_DELETED",
    severity: "CRITICAL",
    status: "REVIEWED",
    source: "CRM_DISCOVERY",
    submissionId: "mock-sub-1",
    branchName: "Fermosa Tejero",
    auditDate: "2026-07-07",
    title: "CRM treatment deleted hours after encoding",
    detail:
      "The CRM activity log shows an Underarm Whitening record created at 11:20 AM and deleted at 6:45 PM the same day by a branch account. The logbook still lists the treatment. Deleted revenue records are a tampering indicator.",
    recommendation:
      "Escalate to management: request the deletion justification and cross-check the day's cash count.",
    expectedValue: "Treatment record retained",
    actualValue: "Record deleted 2026-07-07 18:45",
    evidence: [
      {
        type: "crm-activity",
        crmPatientId: "c-1008",
        occurredAt: "2026-07-07T18:45:00Z",
        logName: "deleted",
      },
      {
        type: "logbook-field",
        imageId: "img-a2",
        pageNumber: 2,
        lineNumber: 2,
        field: "treatment",
      },
    ],
    confidence: 0.99,
    createdAt: "2026-07-13T09:12:20Z",
  },
  {
    id: "f-004",
    category: "RECORD_EDITED",
    severity: "HIGH",
    status: "OPEN",
    source: "CRM_DISCOVERY",
    submissionId: "mock-sub-1",
    branchName: "Fermosa Tejero",
    auditDate: "2026-07-06",
    title: "Invoice amount reduced after the audit date",
    detail:
      "The CRM activity log records amount_paid changed from 800.00 to 500.00 the day after the treatment, and the service name was edited. Post-hoc reductions can indicate unremitted cash.",
    recommendation:
      "Compare the physical receipt against the edited invoice and the daily remittance.",
    expectedValue: "amount_paid 800.00 (as first encoded)",
    actualValue: "amount_paid 500.00 (after edit)",
    evidence: [
      {
        type: "crm-activity",
        crmPatientId: "c-1009",
        occurredAt: "2026-07-07T09:12:00Z",
        logName: "updated",
      },
    ],
    confidence: 0.92,
    createdAt: "2026-07-13T09:12:30Z",
  },
  {
    id: "f-005",
    category: "MISMATCHED_FIELD",
    severity: "MEDIUM",
    status: "OPEN",
    source: "RULE_ENGINE",
    submissionId: "mock-sub-1",
    branchName: "Fermosa Imus",
    auditDate: "2026-07-05",
    title: "Therapist differs between logbook and CRM",
    detail:
      "Logbook line 2 names therapist “K. Ramos”, but the CRM record attributes the session to “M. Lim”. Commission points follow the CRM attribution, so mismatches affect staff pay.",
    recommendation:
      "Confirm with the branch which aesthetician performed the session; correct the CRM tag if wrong.",
    expectedValue: "M. Lim (CRM performed_by)",
    actualValue: "K. Ramos (logbook)",
    evidence: [
      {
        type: "logbook-field",
        imageId: "img-a3",
        pageNumber: 1,
        lineNumber: 2,
        field: "therapist",
      },
      {
        type: "crm-record",
        crmPatientId: "c-1002",
        refNo: null,
        description: "Gluta Drip session 2/10, performed_by M. Lim",
      },
    ],
    confidence: 0.88,
    createdAt: "2026-07-13T09:12:40Z",
  },
  {
    id: "f-006",
    category: "AMBIGUOUS_PATIENT",
    severity: "MEDIUM",
    status: "REVIEWED",
    source: "CRM_DISCOVERY",
    submissionId: "mock-sub-1",
    branchName: "Fermosa Tejero",
    auditDate: "2026-07-11",
    title: "Two CRM patients match “Catherine Cruz”",
    detail:
      "Patient lookup returned two candidates with the same name but different birth dates and mobile numbers. A human must pick before matching can continue for this entry.",
    recommendation: "Disambiguate using the mobile number written in the logbook, if legible.",
    expectedValue: null,
    actualValue: null,
    evidence: [
      {
        type: "logbook-field",
        imageId: "img-a4",
        pageNumber: 1,
        lineNumber: 6,
        field: "patientName",
      },
      { type: "note", text: "Candidates: c-1004 (dob 1988-11-02) and c-1005 (dob 1995-06-21)" },
    ],
    confidence: null,
    createdAt: "2026-07-13T09:12:50Z",
  },
  {
    id: "f-007",
    category: "UNMATCHED_PATIENT",
    severity: "MEDIUM",
    status: "OPEN",
    source: "CRM_DISCOVERY",
    submissionId: "mock-sub-1",
    branchName: "Fermosa Imus",
    auditDate: "2026-07-08",
    title: "Logbook patient not found in the CRM",
    detail:
      "No CRM patient matched “J. Dizon” by name. Either the patient was never registered (walk-in never encoded) or the handwriting was mis-read.",
    recommendation:
      "Verify the name against the page image; if correct, treat as an unregistered walk-in.",
    expectedValue: "Registered CRM patient",
    actualValue: "No match for “J. Dizon”",
    evidence: [
      {
        type: "logbook-field",
        imageId: "img-a5",
        pageNumber: 2,
        lineNumber: 1,
        field: "patientName",
      },
    ],
    confidence: 0.81,
    createdAt: "2026-07-13T09:13:00Z",
  },
  {
    id: "f-008",
    category: "MISSING_IN_LOGBOOK",
    severity: "LOW",
    status: "RESOLVED",
    source: "RULE_ENGINE",
    submissionId: "mock-sub-1",
    branchName: "Fermosa Imus",
    auditDate: "2026-07-05",
    title: "CRM session not written in the logbook",
    detail:
      "The CRM shows Gluta Drip session 1/10 on the audit date, but no corresponding logbook line exists. Usually an omission rather than fraud — the CRM record is the stronger evidence here.",
    recommendation:
      "Remind the branch that every performed session must be logged on paper as well.",
    expectedValue: "Logbook entry for Gluta Drip (session 1/10)",
    actualValue: "Not present on the page",
    evidence: [
      {
        type: "crm-record",
        crmPatientId: "c-1002",
        refNo: "INV-88102",
        description: "Availed service GLUTA DRIP 10 SESSION, session 1",
      },
    ],
    confidence: 0.9,
    createdAt: "2026-07-13T09:13:10Z",
  },
  {
    id: "f-009",
    category: "UNREADABLE_ENTRY",
    severity: "INFO",
    status: "RESOLVED",
    source: "MANUAL_REVIEW",
    submissionId: "mock-sub-1",
    branchName: "Fermosa Tejero",
    auditDate: "2026-07-10",
    title: "Line 7 therapist confirmed illegible",
    detail:
      "OCR could not read the therapist initials on line 7 and the reviewer confirmed the handwriting is illegible. The entry is excluded from therapist matching.",
    recommendation: "Coach the branch on legible logbook writing; consider a printed-name column.",
    expectedValue: null,
    actualValue: null,
    evidence: [
      {
        type: "logbook-field",
        imageId: "img-a1",
        pageNumber: 1,
        lineNumber: 7,
        field: "therapist",
      },
    ],
    confidence: null,
    createdAt: "2026-07-13T09:13:20Z",
  },
  {
    id: "f-010",
    category: "DUPLICATE_ENTRY",
    severity: "LOW",
    status: "OPEN",
    source: "AI_ANALYSIS",
    submissionId: "mock-sub-1",
    branchName: "Fermosa Indang",
    auditDate: "2026-07-09",
    title: "Same session appears twice in the logbook",
    detail:
      "Lines 3 and 5 record the same patient, treatment, and time. Likely a double entry rather than two sessions — the CRM shows a single record.",
    recommendation:
      "Confirm with the branch and strike through the duplicate line per logbook procedure.",
    expectedValue: "One logbook entry",
    actualValue: "Two identical entries (lines 3 and 5)",
    evidence: [
      { type: "logbook-field", imageId: "img-a6", pageNumber: 1, lineNumber: 3, field: null },
      { type: "logbook-field", imageId: "img-a6", pageNumber: 1, lineNumber: 5, field: null },
    ],
    confidence: 0.77,
    createdAt: "2026-07-13T09:13:30Z",
  },
];
