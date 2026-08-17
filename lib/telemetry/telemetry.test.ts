// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AppError, ForbiddenError, InvalidStateError, NotFoundError } from "@/lib/errors";
import { getCorrelationId, newCorrelationId, runWithCorrelation } from "./correlation";
import { addTelemetrySink, classifyError, startSpan, trace } from "./tracer";
import type { Span } from "./types";

function captureSpans(): { spans: Span[]; stop: () => void } {
  const spans: Span[] = [];
  const stop = addTelemetrySink({ record: (span) => void spans.push(span) });
  return { spans, stop };
}

describe("correlation", () => {
  it("propagates across awaits and isolates outside the run", async () => {
    const id = newCorrelationId();
    expect(getCorrelationId()).toBeNull();
    await runWithCorrelation(id, async () => {
      expect(getCorrelationId()).toBe(id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(getCorrelationId()).toBe(id); // survives the await
    });
    expect(getCorrelationId()).toBeNull();
  });

  it("nested correlations shadow correctly", () => {
    runWithCorrelation("outer", () => {
      runWithCorrelation("inner", () => expect(getCorrelationId()).toBe("inner"));
      expect(getCorrelationId()).toBe("outer");
    });
  });
});

describe("spans", () => {
  it("records name, duration, attributes, and correlation id", async () => {
    const { spans, stop } = captureSpans();
    try {
      await runWithCorrelation("job-1", async () => {
        const span = startSpan("test.work", { stage: "OCR" });
        await new Promise((resolve) => setTimeout(resolve, 10));
        span.setAttribute("items", 3);
        span.end();
      });
      expect(spans).toHaveLength(1);
      expect(spans[0]).toMatchObject({
        name: "test.work",
        correlationId: "job-1",
        outcome: "ok",
        attributes: { stage: "OCR", items: 3 },
      });
      expect(spans[0]!.durationMs).toBeGreaterThanOrEqual(8);
    } finally {
      stop();
    }
  });

  it("trace() closes with the error class and rethrows", async () => {
    const { spans, stop } = captureSpans();
    try {
      await expect(
        trace("test.failing", {}, async () => {
          throw new AppError("CRM_UNAVAILABLE", "down");
        })
      ).rejects.toThrow(/down/);
      expect(spans[0]).toMatchObject({ outcome: "error", errorClass: "crm" });
    } finally {
      stop();
    }
  });

  it("end() is idempotent and broken sinks never break the workflow", async () => {
    const { spans, stop } = captureSpans();
    const stopBroken = addTelemetrySink({
      record() {
        throw new Error("sink exploded");
      },
    });
    try {
      const span = startSpan("test.once");
      span.end();
      span.end(new Error("late"));
      expect(spans).toHaveLength(1);
      expect(spans[0]!.outcome).toBe("ok");
    } finally {
      stopBroken();
      stop();
    }
  });
});

describe("classifyError", () => {
  it("maps AppError codes to subsystem classes", () => {
    expect(classifyError(new ForbiddenError())).toBe("authorization");
    expect(classifyError(new NotFoundError())).toBe("not-found");
    expect(classifyError(new InvalidStateError("x"))).toBe("invalid-state");
    expect(classifyError(new AppError("CRM_LAYOUT", "x"))).toBe("crm");
    expect(classifyError(new AppError("AI_TIMEOUT", "x"))).toBe("ai");
    expect(classifyError(new AppError("STORAGE_INVALID_KEY", "x"))).toBe("storage");
    expect(classifyError(new Error("plain"))).toBe("unknown");
  });
});
