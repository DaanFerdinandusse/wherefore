import type { TripStage } from "@/lib/contracts";

// Pure trip rules: the computed stage and the number of itinerary days.
// No I/O, so the Trips board, the snapshot and the tests share one answer.

export const TRIP_STAGES: readonly TripStage[] = ["planning", "shared", "traveling", "done"];

export function isTripStage(value: unknown): value is TripStage {
  return typeof value === "string" && (TRIP_STAGES as readonly string[]).includes(value);
}

/** Today as YYYY-MM-DD in UTC, the format of `date` columns. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type StageInput = {
  stageOverride: string | null;
  shareToken: string | null;
  startDate: string | null;
  endDate: string | null;
};

/**
 * The stage a trip card sits in. A manual override (a drag on the Trips
 * board) wins. Otherwise: done after the end date, traveling while today is
 * within the dates, shared once a share link exists, else planning.
 * Dates are YYYY-MM-DD, so string comparison is date comparison.
 */
export function computeStage(trip: StageInput, today: string = todayIso()): TripStage {
  if (isTripStage(trip.stageOverride)) return trip.stageOverride;
  const end = trip.endDate ?? trip.startDate;
  if (end && today > end) return "done";
  if (trip.startDate && today >= trip.startDate && (!end || today <= end)) return "traveling";
  if (trip.shareToken) return "shared";
  return "planning";
}

export const DEFAULT_UNSET_DAYS = 3;

/** Whole days between two YYYY-MM-DD dates, inclusive. */
export function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

/**
 * Itinerary days: from the dates when both are set, else at least three (the
 * "Not set yet" trip starts with three days and grows with "Add a day").
 */
export function tripDayCount(
  trip: { startDate: string | null; endDate: string | null },
  maxSlotDay: number | null = null,
): number {
  if (trip.startDate && trip.endDate) return daysBetween(trip.startDate, trip.endDate);
  return Math.max(DEFAULT_UNSET_DAYS, maxSlotDay ?? 0);
}
