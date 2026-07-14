import type { FindingDraft } from "@/lib/findings";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";

/**
 * Rule engine contracts (Sprint 3.7, ADR-030). Deterministic — NOT AI.
 * Consumes confirmed OCR data + normalized CRM records; produces
 * `FindingDraft`s (the canonical output, ADR-028) and scores. Never UI
 * models, never OCR models, never raw CRM shapes.
 */

/** One human-confirmed logbook line (output of OCR review). */
export interface ConfirmedEntry {
  imageId: string;
  pageNumber: number;
  lineNumber: number;
  /** Null = reviewer confirmed the field is illegible. */
  patientName: string | null;
  treatment: string | null;
  therapist: string | null;
  time: string | null;
}

/** How CRM discovery resolved one entry's patient. */
export interface PatientResolution {
  /** `${pageNumber}:${lineNumber}` of the entry it belongs to. */
  entryKey: string;
  outcome: "found" | "not-found" | "ambiguous";
  crmPatientId: string | null;
  candidateIds?: string[];
}

export interface RuleContext {
  submission: {
    id: string;
    branchName: string;
    /** yyyy-mm-dd */
    auditDate: string;
  };
  entries: ConfirmedEntry[];
  resolutions: PatientResolution[];
  /** One record per resolved patient, windowed to the audit date. */
  crmRecords: NormalizedCrmPatientRecord[];
  config: RuleEngineConfig;
}

export type RuleOutcome = "pass" | "warning" | "fail" | "review-required";

export interface RuleResult {
  ruleId: string;
  outcome: RuleOutcome;
  /** Present for every non-pass outcome — findings ARE the output. */
  finding?: FindingDraft;
}

/**
 * The pluggable unit: pure, synchronous, deterministic. Register in the
 * RuleRegistry; the evaluator runs every enabled rule. Adding a rule is one
 * file + one registration — nothing else changes.
 */
export interface Rule {
  readonly id: string;
  readonly description: string;
  /** Relative contribution to risk scoring (multiplies severity weight). */
  readonly defaultWeight: number;
  evaluate(context: RuleContext): RuleResult[];
}

// ---------------------------------------------------------------------------
// Configuration — thresholds, tolerances, and weights are data, not code.
// ---------------------------------------------------------------------------

export interface RuleEngineConfig {
  /** Minutes of drift tolerated on treatment dates/times. */
  timeToleranceMinutes: number;
  /** 0..1 — minimum similarity for names/procedures to count as matching. */
  nameSimilarityThreshold: number;
  /** Risk points per finding severity (weighted by the rule's weight). */
  severityWeights: Record<"INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number>;
  /** Per-rule overrides: disable or re-weight without code changes. */
  rules: Record<string, { enabled?: boolean; weight?: number }>;
  /** Minimum "updated" activity events on one patient before repeated-edits fires. */
  repeatedEditsThreshold: number;
  /** Maximum activity events on one patient before suspicious-activity-frequency fires. */
  activityFrequencyThreshold: number;
}

export const DEFAULT_RULE_CONFIG: RuleEngineConfig = {
  timeToleranceMinutes: 30,
  nameSimilarityThreshold: 0.82,
  severityWeights: { INFO: 0, LOW: 1, MEDIUM: 3, HIGH: 7, CRITICAL: 15 },
  rules: {},
  repeatedEditsThreshold: 3,
  activityFrequencyThreshold: 10,
};

export interface EvaluationScores {
  /** 0..100 — accumulated weighted risk, capped. */
  riskScore: number;
  /** 100 − risk: the submission's compliance score. */
  submissionScore: number;
}

export interface EvaluationReport {
  results: RuleResult[];
  findings: FindingDraft[];
  scores: EvaluationScores;
  /** ms spent evaluating — feeds the performance budget test. */
  durationMs: number;
}
