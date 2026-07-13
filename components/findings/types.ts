import type {
  FindingCategory,
  FindingEvidence,
  FindingSeverity,
  FindingSource,
  FindingStatus,
} from "@/lib/findings";

/**
 * Findings kit types (Sprint 3.5; domain vocabulary relocated to
 * `lib/findings.ts` in 3.7 — this module re-exports it for the UI and adds
 * presentation-only concerns).
 */
export {
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  FINDING_SOURCES,
  FINDING_STATUSES,
  SEVERITY_RANK,
  findingEvidenceSchema,
  canTransitionFinding as canTransition,
  nextFindingStatuses as nextStatuses,
} from "@/lib/findings";
export type {
  FindingCategory,
  FindingEvidence,
  FindingSeverity,
  FindingSource,
  FindingStatus,
} from "@/lib/findings";

export const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
  MISSING_IN_CRM: "Missing in CRM",
  MISSING_IN_LOGBOOK: "Missing in logbook",
  MISMATCHED_FIELD: "Mismatched field",
  UNMATCHED_PATIENT: "Patient not found",
  AMBIGUOUS_PATIENT: "Ambiguous patient",
  MISSING_INVOICE: "Missing invoice",
  RECORD_EDITED: "Record edited after the fact",
  RECORD_DELETED: "Record deleted",
  UNREADABLE_ENTRY: "Unreadable entry",
  DUPLICATE_ENTRY: "Duplicate entry",
  OTHER: "Other",
};

export const FINDING_SOURCE_LABELS: Record<FindingSource, string> = {
  RULE_ENGINE: "Rule engine",
  CRM_DISCOVERY: "CRM discovery",
  OCR: "OCR",
  AI_ANALYSIS: "AI analysis",
  MANUAL_REVIEW: "Manual review",
};

/** Serializable finding shape the kit renders (DB row or mock). */
export interface FindingView {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  status: FindingStatus;
  source: FindingSource;
  submissionId: string;
  /** Denormalized for list display. */
  branchName: string;
  auditDate: string; // yyyy-mm-dd
  title: string;
  detail: string;
  recommendation: string | null;
  expectedValue: string | null;
  actualValue: string | null;
  evidence: FindingEvidence[];
  confidence: number | null;
  createdAt: string; // ISO
}
