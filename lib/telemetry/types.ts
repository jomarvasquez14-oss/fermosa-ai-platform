/**
 * Telemetry contracts (Sprint 4.0B, ADR-032). Interfaces only — no vendor:
 * the default sink writes structured entries through the existing logger;
 * a Datadog/OTel sink later implements `TelemetrySink` and nothing else moves.
 */

/** One timed unit of work (an orchestrator stage, a rule evaluation, ...). */
export interface Span {
  /** Dot-separated name, e.g. "orchestrator.stage", "rules.evaluate". */
  name: string;
  correlationId: string | null;
  startedAt: string; // ISO
  durationMs: number;
  /** IDs and small scalars only — never entities, never PII. */
  attributes: Record<string, string | number | boolean | null>;
  outcome: "ok" | "error";
  errorClass?: ErrorClass;
}

export interface TelemetrySink {
  record(span: Span): void;
}

/**
 * Coarse error classification for dashboards and alerting — which SUBSYSTEM
 * failed, not which line. Derived from AppError codes.
 */
export type ErrorClass =
  | "validation"
  | "authorization"
  | "not-found"
  | "invalid-state"
  | "crm"
  | "ai"
  | "storage"
  | "infrastructure"
  | "unknown";
