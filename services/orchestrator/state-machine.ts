import { InvalidStateError } from "@/lib/errors";
import type { AuditTransition, RunStatus } from "./types";

/**
 * AuditStateMachine — the single authority on legal run-status transitions
 * for jobs and stages. Every mutation in the orchestrator passes through
 * `assertTransition`; illegal transitions are rejected loudly, never patched.
 *
 *   QUEUED ──► RUNNING ──► COMPLETED
 *                │  ▲            (terminal)
 *                │  └── WAITING (external signal resumes)
 *                │  └── RETRYING (failure being retried)
 *                ▼
 *              FAILED ──► RETRYING ──► RUNNING
 *   any non-terminal ──► CANCELLED (terminal)
 */
const LEGAL: Record<RunStatus, readonly RunStatus[]> = {
  QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: ["COMPLETED", "WAITING", "FAILED", "CANCELLED"],
  WAITING: ["RUNNING", "CANCELLED"],
  FAILED: ["RETRYING", "CANCELLED"],
  RETRYING: ["RUNNING", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: readonly RunStatus[] = ["COMPLETED", "CANCELLED"];

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return LEGAL[from].includes(to);
}

export function legalTransitionsFrom(from: RunStatus): readonly RunStatus[] {
  return LEGAL[from];
}

/** Throws InvalidStateError for an illegal transition; returns it otherwise. */
export function assertTransition(transition: AuditTransition): AuditTransition {
  if (!canTransition(transition.from, transition.to)) {
    throw new InvalidStateError(
      `Illegal audit state transition: ${transition.from} → ${transition.to}.`
    );
  }
  return transition;
}
