import { PIPELINE_STAGES, type PipelineStage, type PipelineStageId } from "./pipeline-stages";

/**
 * The pipeline runner core (M0054) — walks the stage list (data, not branches)
 * in order, running each enabled stage's injected runner and recording its
 * result. Disabled stages (OCR today) are recorded as "skipped". A stage
 * failure STOPS the run loudly: no later stage runs, the run is FAILED, and the
 * failing stage + message are recorded. Pure orchestration — every side effect
 * lives in an injected runner, so this is unit-testable without a DB or CRM.
 */

/** Shared, accumulating state a stage may read from and write to. */
export interface PipelineContext {
  submissionId: string | null;
  /** Free-form artifacts a stage produces for later stages (e.g. record counts). */
  artifacts: Record<string, unknown>;
}

export interface StageRunResult {
  stage: PipelineStageId;
  status: "ok" | "skipped" | "failed";
  ms: number;
  detail: string;
}

export type StageRunner = (context: PipelineContext) => Promise<string>;

export interface PipelineResult {
  status: "COMPLETED" | "FAILED";
  stages: StageRunResult[];
  error: string | null;
}

/**
 * Run the pipeline. `runners` maps a stage id to its executor; an enabled stage
 * with no runner is a configuration error (fail loudly — never silently skip an
 * enabled stage). Disabled stages need no runner.
 */
export async function runPipeline(
  context: PipelineContext,
  runners: Partial<Record<PipelineStageId, StageRunner>>,
  stages: readonly PipelineStage[] = PIPELINE_STAGES
): Promise<PipelineResult> {
  const results: StageRunResult[] = [];

  for (const stage of stages) {
    if (!stage.enabled) {
      results.push({ stage: stage.id, status: "skipped", ms: 0, detail: `${stage.label} disabled` });
      continue;
    }

    const runner = runners[stage.id];
    if (!runner) {
      const detail = `No runner registered for enabled stage ${stage.id}`;
      results.push({ stage: stage.id, status: "failed", ms: 0, detail });
      return { status: "FAILED", stages: results, error: detail };
    }

    const startedAt = performance.now();
    try {
      const detail = await runner(context);
      results.push({
        stage: stage.id,
        status: "ok",
        ms: Math.round(performance.now() - startedAt),
        detail,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        stage: stage.id,
        status: "failed",
        ms: Math.round(performance.now() - startedAt),
        detail: message,
      });
      // Fail loudly: stop the run at the first failed stage.
      return { status: "FAILED", stages: results, error: `${stage.id}: ${message}` };
    }
  }

  return { status: "COMPLETED", stages: results, error: null };
}
