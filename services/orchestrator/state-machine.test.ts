// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, isTerminal, legalTransitionsFrom } from "./state-machine";
import { RUN_STATUSES, type RunStatus } from "./types";

describe("AuditStateMachine", () => {
  it("allows the documented lifecycle", () => {
    expect(canTransition("QUEUED", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "COMPLETED")).toBe(true);
    expect(canTransition("RUNNING", "WAITING")).toBe(true);
    expect(canTransition("WAITING", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "FAILED")).toBe(true);
    expect(canTransition("FAILED", "RETRYING")).toBe(true);
    expect(canTransition("RETRYING", "RUNNING")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("QUEUED", "COMPLETED")).toBe(false); // no skipping execution
    expect(canTransition("COMPLETED", "RUNNING")).toBe(false); // terminal
    expect(canTransition("CANCELLED", "RUNNING")).toBe(false); // terminal
    expect(canTransition("FAILED", "RUNNING")).toBe(false); // must go through RETRYING
    expect(canTransition("WAITING", "COMPLETED")).toBe(false); // resume first
    expect(() => assertTransition({ from: "COMPLETED", to: "RUNNING" })).toThrow(
      /Illegal audit state transition/
    );
  });

  it("every non-terminal status can be cancelled; terminals cannot", () => {
    for (const status of RUN_STATUSES as readonly RunStatus[]) {
      expect(canTransition(status, "CANCELLED")).toBe(!isTerminal(status));
    }
  });

  it("terminal statuses have no outgoing transitions", () => {
    expect(legalTransitionsFrom("COMPLETED")).toEqual([]);
    expect(legalTransitionsFrom("CANCELLED")).toEqual([]);
  });
});
