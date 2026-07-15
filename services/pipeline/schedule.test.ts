// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ScheduleCadence } from "@prisma/client";
import { dueSchedules, isDue, nextRunAt, type ScheduleLike } from "./schedule";

const at = (iso: string) => new Date(iso);

describe("nextRunAt", () => {
  it("advances by cadence and returns null for MANUAL", () => {
    const from = at("2026-07-14T00:00:00.000Z");
    expect(nextRunAt("MANUAL", from)).toBeNull();
    expect(nextRunAt("NIGHTLY", from)!.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(nextRunAt("WEEKLY", from)!.toISOString()).toBe("2026-07-21T00:00:00.000Z");
    expect(nextRunAt("MONTHLY", from)!.toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("isDue", () => {
  const base = (over: Partial<ScheduleLike> = {}): ScheduleLike => ({
    cadence: "NIGHTLY" as ScheduleCadence,
    enabled: true,
    nextRunAt: null,
    ...over,
  });
  const now = at("2026-07-14T12:00:00.000Z");

  it("is due when enabled, automatic, and nextRunAt is null or past", () => {
    expect(isDue(base({ nextRunAt: null }), now)).toBe(true);
    expect(isDue(base({ nextRunAt: at("2026-07-14T11:00:00.000Z") }), now)).toBe(true);
  });

  it("is not due when nextRunAt is in the future", () => {
    expect(isDue(base({ nextRunAt: at("2026-07-14T13:00:00.000Z") }), now)).toBe(false);
  });

  it("is never due when disabled or MANUAL", () => {
    expect(isDue(base({ enabled: false }), now)).toBe(false);
    expect(isDue(base({ cadence: "MANUAL" }), now)).toBe(false);
  });
});

describe("dueSchedules", () => {
  it("filters a set to the due ones", () => {
    const now = at("2026-07-14T12:00:00.000Z");
    const schedules: (ScheduleLike & { id: string })[] = [
      { id: "a", cadence: "NIGHTLY", enabled: true, nextRunAt: null },
      { id: "b", cadence: "WEEKLY", enabled: true, nextRunAt: at("2026-07-20T00:00:00.000Z") },
      { id: "c", cadence: "MANUAL", enabled: true, nextRunAt: null },
      { id: "d", cadence: "MONTHLY", enabled: false, nextRunAt: null },
    ];
    expect(dueSchedules(schedules, now).map((s) => s.id)).toEqual(["a"]);
  });
});
