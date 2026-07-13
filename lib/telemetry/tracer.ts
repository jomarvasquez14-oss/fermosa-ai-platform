import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getCorrelationId } from "./correlation";
import type { ErrorClass, Span, TelemetrySink } from "./types";

/** Span recording + timing helpers (Sprint 4.0B). */

/** AppError code → subsystem class. Unmapped codes fall through by prefix. */
export function classifyError(error: unknown): ErrorClass {
  if (!isAppError(error)) return "unknown";
  const code = error.code;
  if (code === "VALIDATION" || code === "PROMPT_UNKNOWN") return "validation";
  if (code === "FORBIDDEN") return "authorization";
  if (code === "NOT_FOUND") return "not-found";
  if (code === "INVALID_STATE") return "invalid-state";
  if (code.startsWith("CRM_")) return "crm";
  if (code.startsWith("AI_")) return "ai";
  if (code.startsWith("STORAGE_")) return "storage";
  if (code === "NOT_IMPLEMENTED") return "infrastructure";
  return "unknown";
}

/** Default sink: structured log line per span through the existing logger. */
const loggerSink: TelemetrySink = {
  record(span) {
    const payload = {
      span: span.name,
      correlationId: span.correlationId,
      durationMs: Math.round(span.durationMs * 100) / 100,
      outcome: span.outcome,
      ...(span.errorClass ? { errorClass: span.errorClass } : {}),
      ...span.attributes,
    };
    if (span.outcome === "error") logger.warn("span", payload);
    else logger.info("span", payload);
  },
};

const sinks: TelemetrySink[] = [loggerSink];

/** Register an additional sink (a future OTel/Datadog adapter). */
export function addTelemetrySink(sink: TelemetrySink): () => void {
  sinks.push(sink);
  return () => {
    const index = sinks.indexOf(sink);
    if (index !== -1) sinks.splice(index, 1);
  };
}

function emit(span: Span): void {
  for (const sink of sinks) {
    try {
      sink.record(span);
    } catch {
      // A broken sink must never break the workflow it observes.
    }
  }
}

export interface ActiveSpan {
  setAttribute(key: string, value: string | number | boolean | null): void;
  /** Close the span; pass the error when the work failed. */
  end(error?: unknown): void;
}

/** Start a span manually (call `end` exactly once). */
export function startSpan(name: string, attributes: Span["attributes"] = {}): ActiveSpan {
  const startedAt = new Date().toISOString();
  const startedTick = performance.now();
  const collected: Span["attributes"] = { ...attributes };
  let ended = false;

  return {
    setAttribute(key, value) {
      collected[key] = value;
    },
    end(error?: unknown) {
      if (ended) return;
      ended = true;
      emit({
        name,
        correlationId: getCorrelationId(),
        startedAt,
        durationMs: performance.now() - startedTick,
        attributes: collected,
        outcome: error === undefined ? "ok" : "error",
        ...(error === undefined ? {} : { errorClass: classifyError(error) }),
      });
    },
  };
}

/** Trace an async operation: span opens before, closes after, errors rethrow. */
export async function trace<T>(
  name: string,
  attributes: Span["attributes"],
  operation: (span: ActiveSpan) => Promise<T>
): Promise<T> {
  const span = startSpan(name, attributes);
  try {
    const result = await operation(span);
    span.end();
    return result;
  } catch (error) {
    span.end(error);
    throw error;
  }
}
