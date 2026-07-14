// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseArgs } from "./generate-crm-dataset";

/**
 * CLI arg parsing (M0050). pnpm inserts a literal "--" ahead of passthrough
 * args; `--crm-id` is repeatable; `--verify`/`--resume` are booleans.
 */
describe("parseArgs", () => {
  it("strips the pnpm '--' separator and collects repeated --crm-id", () => {
    const opts = parseArgs([
      "--",
      "--mode",
      "patient",
      "--crm-id",
      "c-1",
      "--crm-id",
      "c-2",
      "--out",
      "datasets/b",
    ]);
    expect(opts.mode).toBe("patient");
    expect(opts.crmIds).toEqual(["c-1", "c-2"]);
    expect(opts.outDir).toBe("datasets/b");
    expect(opts.resume).toBe(false);
    expect(opts.verify).toBe(false);
  });

  it("parses sweep flags: branch, window, resume, verify", () => {
    const opts = parseArgs([
      "--mode",
      "dateRange",
      "--from",
      "2026-01-01",
      "--to",
      "2026-06-30",
      "--out",
      "d",
      "--resume",
    ]);
    expect(opts.mode).toBe("dateRange");
    expect(opts.window).toEqual({ from: "2026-01-01", to: "2026-06-30" });
    expect(opts.resume).toBe(true);

    const verifyOpts = parseArgs(["--mode", "all", "--out", "d", "--verify"]);
    expect(verifyOpts.verify).toBe(true);
    expect(verifyOpts.crmIds).toBeUndefined();
  });

  it("rejects an unknown mode, a missing --out, and a half window", () => {
    expect(() => parseArgs(["--mode", "nope", "--out", "d"])).toThrow(/--mode must be one of/);
    expect(() => parseArgs(["--mode", "all"])).toThrow(/--out is required/);
    expect(() => parseArgs(["--mode", "dateRange", "--from", "2026-01-01", "--out", "d"])).toThrow(
      /--from and --to must be provided together/
    );
  });
});
