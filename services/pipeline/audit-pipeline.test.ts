// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runPipeline, type PipelineContext, type StageRunner } from "./audit-pipeline";
import { PIPELINE_STAGES, type PipelineStageId } from "./pipeline-stages";

function ctx(): PipelineContext {
  return { submissionId: "sub-1", artifacts: {} };
}

/** A runner for every enabled stage that just records its id. */
function allEnabledRunners(): Partial<Record<PipelineStageId, StageRunner>> {
  const runners: Partial<Record<PipelineStageId, StageRunner>> = {};
  for (const stage of PIPELINE_STAGES) {
    if (stage.enabled) runners[stage.id] = async () => `ran ${stage.id}`;
  }
  return runners;
}

describe("runPipeline", () => {
  it("runs every enabled stage in order and records OCR as skipped", async () => {
    const result = await runPipeline(ctx(), allEnabledRunners());
    expect(result.status).toBe("COMPLETED");
    expect(result.error).toBeNull();

    const ocr = result.stages.find((s) => s.stage === "OCR")!;
    expect(ocr.status).toBe("skipped");
    // Every non-OCR stage ran ok, in declared order.
    const nonOcr = result.stages.filter((s) => s.stage !== "OCR");
    expect(nonOcr.every((s) => s.status === "ok")).toBe(true);
    expect(result.stages.map((s) => s.stage)).toEqual(PIPELINE_STAGES.map((s) => s.id));
  });

  it("stops loudly at the first failing stage — no later stage runs", async () => {
    const runners = allEnabledRunners();
    runners.RULES = async () => {
      throw new Error("engine boom");
    };
    const result = await runPipeline(ctx(), runners);
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("RULES: engine boom");

    const rules = result.stages.find((s) => s.stage === "RULES")!;
    expect(rules.status).toBe("failed");
    // REPORT is after RULES — it must not have run.
    expect(result.stages.find((s) => s.stage === "REPORT")).toBeUndefined();
  });

  it("fails loudly when an enabled stage has no runner (config error)", async () => {
    const runners = allEnabledRunners();
    delete runners.REPORT;
    const result = await runPipeline(ctx(), runners);
    expect(result.status).toBe("FAILED");
    expect(result.error).toMatch(/No runner registered for enabled stage REPORT/);
  });

  it("passes artifacts between stages", async () => {
    const runners = allEnabledRunners();
    runners.RULES = async (context) => {
      context.artifacts.count = 3;
      return "produced 3";
    };
    runners.FINDINGS = async (context) => `persisted ${context.artifacts.count as number}`;
    const result = await runPipeline(ctx(), runners);
    const findings = result.stages.find((s) => s.stage === "FINDINGS")!;
    expect(findings.detail).toBe("persisted 3");
  });

  it("honors a custom stage list where OCR is enabled with a runner", async () => {
    const stages = [
      { id: "OCR" as const, label: "OCR", enabled: true },
      { id: "STORE" as const, label: "Store", enabled: true },
    ];
    const result = await runPipeline(ctx(), { OCR: async () => "ocr ran", STORE: async () => "stored" }, stages);
    expect(result.status).toBe("COMPLETED");
    expect(result.stages.find((s) => s.stage === "OCR")!.status).toBe("ok");
  });
});
