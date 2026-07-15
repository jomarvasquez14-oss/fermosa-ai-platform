/**
 * Scheduled audit pipeline — the stage list as DATA (M0054, ADR-038).
 *
 * The pipeline runner walks THIS array in order; it never hard-codes stage
 * names in branches. OCR is present but `enabled: false` — the OCR-integration
 * phase flips it on and supplies its runner, with no change to the runner loop.
 * The pre-OCR stages that can run today (snapshot, dataset, rules→findings,
 * report, store) compose existing services rather than reimplementing them.
 */

export const PIPELINE_STAGE_IDS = [
  "OCR",
  "SNAPSHOT",
  "DATASET",
  "RULES",
  "FINDINGS",
  "REPORT",
  "STORE",
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGE_IDS)[number];

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  /** Disabled stages are recorded as "skipped" and never executed. */
  enabled: boolean;
}

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { id: "OCR", label: "OCR extraction", enabled: false },
  { id: "SNAPSHOT", label: "CRM evidence snapshot", enabled: true },
  { id: "DATASET", label: "CRM dataset", enabled: true },
  { id: "RULES", label: "Rule engine", enabled: true },
  { id: "FINDINGS", label: "Persist findings", enabled: true },
  { id: "REPORT", label: "Audit report", enabled: true },
  { id: "STORE", label: "Store results", enabled: true },
] as const;
