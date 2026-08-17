import { AsyncLocalStorage } from "async_hooks";

/**
 * Correlation context (Sprint 4.0B) — one id follows a workflow across
 * services, spans, and log lines. Node-only (AsyncLocalStorage); never import
 * from edge code (middleware).
 */

const storage = new AsyncLocalStorage<{ correlationId: string }>();

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

/** Run `fn` with a correlation id visible to everything it awaits. */
export function runWithCorrelation<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

/** The active correlation id, or null outside any correlated workflow. */
export function getCorrelationId(): string | null {
  return storage.getStore()?.correlationId ?? null;
}
