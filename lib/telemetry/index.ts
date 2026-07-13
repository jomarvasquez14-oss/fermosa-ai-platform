/**
 * Telemetry (Sprint 4.0B, ADR-032): structured spans, correlation ids, and
 * error classification — clean interfaces, no third-party monitoring. The
 * default sink logs through `lib/logger`; vendor adapters implement
 * `TelemetrySink` later without touching instrumented code.
 *
 * Node-only (AsyncLocalStorage) — never import from middleware/edge code.
 */
export * from "./types";
export { getCorrelationId, newCorrelationId, runWithCorrelation } from "./correlation";
export { addTelemetrySink, classifyError, startSpan, trace } from "./tracer";
export type { ActiveSpan } from "./tracer";
