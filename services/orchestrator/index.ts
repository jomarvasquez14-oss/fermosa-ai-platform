import "server-only";
import { AuditOrchestrator } from "./audit-orchestrator";
import { matchingExecutor } from "./executors/matching-executor";
import { createMockExecutors } from "./executors/mock-executors";
import type { StageExecutor } from "./types";

export { AuditOrchestrator } from "./audit-orchestrator";
export * from "./types";
export * from "./state-machine";

let instance: AuditOrchestrator | null = null;

/**
 * Orchestrator factory (ADR-029). Real integrations replace individual
 * executors here — one line each — without touching the orchestrator or its
 * callers. Replaced so far: MATCHING (rule engine, Sprint 3.7). OCR / CRM
 * retrieval / report remain simulated.
 */
export function getAuditOrchestrator(executors?: StageExecutor[]): AuditOrchestrator {
  if (executors) return new AuditOrchestrator(executors);
  instance ??= new AuditOrchestrator(
    createMockExecutors().map((executor) =>
      executor.stage === "MATCHING" ? matchingExecutor : executor
    )
  );
  return instance;
}
