// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseArgs } from "./build-audit-package";

describe("build-audit-package parseArgs", () => {
  it("collects repeated --crm-id and requires branch + out", () => {
    const opts = parseArgs([
      "--",
      "--branch",
      "Fermosa Imus",
      "--crm-id",
      "c-1002",
      "--crm-id",
      "c-1007",
      "--out",
      "audit-packages",
    ]);
    expect(opts.branch).toBe("Fermosa Imus");
    expect(opts.crmIds).toEqual(["c-1002", "c-1007"]);
    expect(opts.outDir).toBe("audit-packages");
    expect(opts.verify).toBe(false);
  });

  it("parses a window and --verify", () => {
    const opts = parseArgs([
      "--branch",
      "B",
      "--from",
      "2026-01-01",
      "--to",
      "2026-06-30",
      "--out",
      "p",
      "--verify",
    ]);
    expect(opts.window).toEqual({ from: "2026-01-01", to: "2026-06-30" });
    expect(opts.verify).toBe(true);
    expect(opts.crmIds).toBeUndefined();
  });

  it("rejects missing branch/out, a half window, and no selector", () => {
    expect(() => parseArgs(["--out", "p", "--crm-id", "c-1"])).toThrow(/--branch is required/);
    expect(() => parseArgs(["--branch", "B", "--crm-id", "c-1"])).toThrow(/--out is required/);
    expect(() => parseArgs(["--branch", "B", "--out", "p"])).toThrow(
      /--crm-id .* or --from\/--to/
    );
    expect(() => parseArgs(["--branch", "B", "--out", "p", "--from", "2026-01-01"])).toThrow(
      /--from and --to must be provided together/
    );
  });
});
