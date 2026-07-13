import type { StageContext, StageExecutor, StageOutcome } from "../types";

/**
 * Mock stage executors (Sprint 3.6) — simulate stage work so the workflow is
 * fully exercisable before OCR/CRM/matching integrations exist. Each real
 * integration replaces exactly one executor; the orchestrator is untouched.
 *
 * HUMAN_REVIEW is the one honest stage: it genuinely waits for the reviewer
 * signal (`completeWaitingStage`) — mirroring how it will always work.
 */

const simulatedDelayMs = 400;

function simulated(stage: StageExecutor["stage"]): StageExecutor {
  return {
    stage,
    async execute(_context: StageContext): Promise<StageOutcome> {
      await new Promise((resolve) => setTimeout(resolve, simulatedDelayMs));
      return { kind: "completed" };
    },
  };
}

const humanReviewExecutor: StageExecutor = {
  stage: "HUMAN_REVIEW",
  async execute(): Promise<StageOutcome> {
    return { kind: "waiting", reason: "Waiting for a reviewer to confirm the OCR results." };
  },
};

export function createMockExecutors(): StageExecutor[] {
  return [
    simulated("OCR"),
    humanReviewExecutor,
    simulated("CRM_RETRIEVAL"),
    simulated("MATCHING"),
    simulated("REPORT"),
  ];
}
