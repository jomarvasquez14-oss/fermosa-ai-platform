/**
 * Scheduled audit pipeline (M0054, ADR-038) — public surface. A cadence layer
 * over the existing per-submission orchestration: the stage list is data
 * (OCR present but disabled), the runner walks it and records each result, and
 * the service composes the real rule/finding/report/snapshot services. Nothing
 * here reimplements the audit — it schedules and records it.
 */
export {
  PIPELINE_STAGES,
  PIPELINE_STAGE_IDS,
  type PipelineStage,
  type PipelineStageId,
} from "./pipeline-stages";
export {
  runPipeline,
  type PipelineContext,
  type PipelineResult,
  type StageRunResult,
  type StageRunner,
} from "./audit-pipeline";
export { dueSchedules, isDue, nextRunAt, type ScheduleLike } from "./schedule";
export { defaultRunners, runDueSchedules, runSubmissionPipeline } from "./pipeline-service";
