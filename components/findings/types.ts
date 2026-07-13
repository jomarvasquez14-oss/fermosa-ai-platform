import { z } from "zod";

/**
 * Findings kit types (Sprint 3.5, ADR-028).
 *
 * String unions mirror the Prisma enums (`FindingCategory` etc.) — duplicated
 * here, like `lib/auth/roles.ts`, so client components never import Prisma.
 * Any enum change is a migration + an update here + DOMAIN_MODEL §.
 */

export const FINDING_CATEGORIES = [
  "MISSING_IN_CRM",
  "MISSING_IN_LOGBOOK",
  "MISMATCHED_FIELD",
  "UNMATCHED_PATIENT",
  "AMBIGUOUS_PATIENT",
  "MISSING_INVOICE",
  "RECORD_EDITED",
  "RECORD_DELETED",
  "UNREADABLE_ENTRY",
  "DUPLICATE_ENTRY",
  "OTHER",
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

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

export const FINDING_SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/** Ordering weight — higher means more severe. Used for sorting and rollups. */
export const SEVERITY_RANK: Record<FindingSeverity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export const FINDING_STATUSES = ["OPEN", "REVIEWED", "RESOLVED"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/**
 * Status workflow (DOMAIN_MODEL §5.5): linear OPEN → REVIEWED → RESOLVED.
 * Reopening is allowed (new evidence); skipping review is not — every
 * resolution passes through human review. Findings are never deleted.
 */
const ALLOWED_TRANSITIONS: Record<FindingStatus, readonly FindingStatus[]> = {
  OPEN: ["REVIEWED"],
  REVIEWED: ["RESOLVED", "OPEN"],
  RESOLVED: ["OPEN"],
};

export function canTransition(from: FindingStatus, to: FindingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: FindingStatus): readonly FindingStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

export const FINDING_SOURCES = [
  "RULE_ENGINE",
  "CRM_DISCOVERY",
  "OCR",
  "AI_ANALYSIS",
  "MANUAL_REVIEW",
] as const;
export type FindingSource = (typeof FINDING_SOURCES)[number];

export const FINDING_SOURCE_LABELS: Record<FindingSource, string> = {
  RULE_ENGINE: "Rule engine",
  CRM_DISCOVERY: "CRM discovery",
  OCR: "OCR",
  AI_ANALYSIS: "AI analysis",
  MANUAL_REVIEW: "Manual review",
};

/**
 * Typed evidence references — every finding points at the material it is
 * based on. IDs only; the UI resolves them to links/labels.
 */
export const findingEvidenceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("logbook-field"),
    imageId: z.string(),
    pageNumber: z.number().int().min(1),
    lineNumber: z.number().int().min(1),
    field: z.enum(["patientName", "treatment", "therapist", "time"]).nullable(),
  }),
  z.object({
    type: z.literal("crm-record"),
    crmPatientId: z.string(),
    refNo: z.string().nullable(),
    description: z.string(),
  }),
  z.object({
    type: z.literal("crm-activity"),
    crmPatientId: z.string(),
    occurredAt: z.string(),
    logName: z.string(),
  }),
  z.object({ type: z.literal("note"), text: z.string() }),
]);
export type FindingEvidence = z.infer<typeof findingEvidenceSchema>;

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
