import { z } from "zod";

/**
 * Finding domain vocabulary (ADR-028; relocated from the UI kit in Sprint 3.7
 * so services — the rule engine foremost — depend on lib/, not components/).
 *
 * String unions mirror the Prisma enums; any enum change is a migration + an
 * update here + a DOMAIN_MODEL entry.
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

export function canTransitionFinding(from: FindingStatus, to: FindingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function nextFindingStatuses(from: FindingStatus): readonly FindingStatus[] {
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

/**
 * Typed evidence references — every finding points at the material it is
 * based on. IDs only; UIs resolve them to links/labels.
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

/** A finding as a producer emits it — everything but identity/status/workflow. */
export interface FindingDraft {
  category: FindingCategory;
  severity: FindingSeverity;
  source: FindingSource;
  title: string;
  detail: string;
  recommendation: string | null;
  expectedValue: string | null;
  actualValue: string | null;
  evidence: FindingEvidence[];
  confidence: number | null;
}
