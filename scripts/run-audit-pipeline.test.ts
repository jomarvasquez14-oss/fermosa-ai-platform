// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseArgs } from "./run-audit-pipeline";

describe("run-audit-pipeline parseArgs", () => {
  it("parses --now --submission", () => {
    const opts = parseArgs(["--", "--now", "--submission", "sub-1"]);
    expect(opts.mode).toBe("now");
    expect(opts.submissionId).toBe("sub-1");
  });

  it("parses --due", () => {
    expect(parseArgs(["--due"]).mode).toBe("due");
  });

  it("rejects --now without --submission and a missing mode", () => {
    expect(() => parseArgs(["--now"])).toThrow(/--now requires --submission/);
    expect(() => parseArgs(["--submission", "x"])).toThrow(/provide --now .* or --due/);
  });
});
