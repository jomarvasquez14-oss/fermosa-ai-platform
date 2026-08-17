import type { ScheduleCadence } from "@prisma/client";

/**
 * Pipeline schedule cadence math (M0054) — PURE, deterministic, timezone-naive
 * (operates on the Date it is given; the caller decides "now"). No Prisma, no
 * I/O. `MANUAL` schedules are never automatically due.
 */

export interface ScheduleLike {
  cadence: ScheduleCadence;
  enabled: boolean;
  nextRunAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The next run time after `from` for a cadence (null for MANUAL). */
export function nextRunAt(cadence: ScheduleCadence, from: Date): Date | null {
  switch (cadence) {
    case "MANUAL":
      return null;
    case "NIGHTLY":
      return new Date(from.getTime() + DAY_MS);
    case "WEEKLY":
      return new Date(from.getTime() + 7 * DAY_MS);
    case "MONTHLY": {
      const next = new Date(from);
      next.setMonth(next.getMonth() + 1);
      return next;
    }
  }
}

/**
 * A schedule is due when it is enabled, automatic (not MANUAL), and either has
 * no `nextRunAt` yet (never run → run now) or its `nextRunAt` is at/behind now.
 */
export function isDue(schedule: ScheduleLike, now: Date): boolean {
  if (!schedule.enabled || schedule.cadence === "MANUAL") return false;
  if (schedule.nextRunAt === null) return true;
  return schedule.nextRunAt.getTime() <= now.getTime();
}

/** Filter a set of schedules to those due at `now`. */
export function dueSchedules<T extends ScheduleLike>(schedules: T[], now: Date): T[] {
  return schedules.filter((schedule) => isDue(schedule, now));
}
