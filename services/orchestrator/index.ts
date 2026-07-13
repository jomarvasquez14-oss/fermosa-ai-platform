import "server-only";
import { AuditOrchestrator } from "./audit-orchestrator";
import { createMockExecutors } from "./executors/mock-executors";
import type { StageExecutor } from "./types";

export { AuditOrchestrator } from "./audit-orchestrator";
export * from "./types";
export * from "./state-machine";

let instance: AuditOrchestrator | null = null;

/**
 * Orchestrator factory (ADR-029). Default wiring uses the mock executors;
 * real integrations replace individual executors here — one line each —
 * without touching the orchestrator or its callers.
 */
export function getAuditOrchestrator(executors?: StageExecutor[]): AuditOrchestrator {
  if (executors) return new AuditOrchestrator(executors);
  instance ??= new AuditOrchestrator(createMockExecutors());
  return instance;
}
