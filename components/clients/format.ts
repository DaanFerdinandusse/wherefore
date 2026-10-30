import type { TripStage } from "@/lib/contracts";

// Pure copy and date helpers for the Clients page and the client profile.
// Dates are YYYY-MM-DD strings, compared and printed in UTC so a day never
// shifts with the viewer's time zone.

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

/** Today as YYYY-MM-DD in UTC. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * "12 to 16 Nov", "28 Nov to 3 Dec", "4 to 8 Mar 2026" (the year only when it
 * is not this year), "From 12 Nov" without an end, null without dates.
 */
export function tripDatesLabel(startDate: string | null, endDate: string | null, today: string = todayIso()): string | null {
  if (!startDate) return null;
  const thisYear = parts(today).year;
  const a = parts(startDate);
  const yearSuffix = (year: number) => (year === thisYear ? "" : ` ${year}`);
  if (!endDate || endDate === startDate) {
    const label = `${a.day} ${MONTHS_SHORT[a.month]}${yearSuffix(a.year)}`;
    return endDate ? label : `From ${label}`;
  }
  const b = parts(endDate);
  if (a.year !== b.year) {
    return `${a.day} ${MONTHS_SHORT[a.month]} ${a.year} to ${b.day} ${MONTHS_SHORT[b.month]} ${b.year}`;
  }
  if (a.month !== b.month) {
    return `${a.day} ${MONTHS_SHORT[a.month]} to ${b.day} ${MONTHS_SHORT[b.month]}${yearSuffix(b.year)}`;
  }
  return `${a.day} to ${b.day} ${MONTHS_SHORT[b.month]}${yearSuffix(b.year)}`;
}

/** Whole days from today to a date (negative in the past). */
export function daysUntil(iso: string, today: string = todayIso()): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "in 22 days", "tomorrow", "today". */
export function inDaysLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export const STAGE_LABEL: Record<TripStage, string> = {
  planning: "Planning",
  shared: "Shared",
  traveling: "Traveling",
  done: "Done",
};

/** "Updated today", "Updated yesterday", "Updated 3 days ago", "Updated 12 Mar", "Updated 12 Mar 2025". */
export function activityLabel(at: Date, now: Date = new Date()): string {
  const today = todayIso(now);
  const day = todayIso(at);
  const days = -daysUntil(day, today);
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 7) return `Updated ${days} days ago`;
  const p = parts(day);
  const year = p.year === parts(today).year ? "" : ` ${p.year}`;
  return `Updated ${p.day} ${MONTHS_SHORT[p.month]}${year}`;
}

/** "March 2024", for "Client since March 2024". */
export function monthYear(at: Date): string {
  return `${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

/** The first word of a name, for "New trip for Ana". Falls back to the whole name. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

/**
 * "Via Carota", "Via Carota and Buna", "Via Carota, Buna and Clamato",
 * "Via Carota, Buna, Clamato and 3 more" when `total` is larger than the names.
 */
export function namesLine(names: readonly string[], total: number = names.length): string {
  const more = Math.max(0, total - names.length);
  if (more > 0) return `${names.join(", ")} and ${more} more`;
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "1 trip", "3 trips". */
export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * "Updated today", or "Added today" while nothing changed since the client
 * was created that day (the card line "Berlin · 1 trip · Added today").
 */
export function activityLine(lastActivityAt: Date, createdAt: Date, now: Date = new Date()): string {
  const label = activityLabel(lastActivityAt, now);
  return todayIso(lastActivityAt) === todayIso(createdAt) ? label.replace(/^Updated/, "Added") : label;
}

/**
 * The Clients page filters. "Trip coming up" is any client with a trip that
 * has not ended (traveling now included); "No trip yet" is a client without
 * any trip. A client whose trips are all past is only under All.
 */
export const CLIENT_FILTERS = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Trip coming up" },
  { key: "none", label: "No trip yet" },
] as const;

export type ClientFilter = (typeof CLIENT_FILTERS)[number]["key"];

export function isClientFilter(value: unknown): value is ClientFilter {
  return CLIENT_FILTERS.some((filter) => filter.key === value);
}

type FilterFields = { nextTrip: unknown; tripCount: number };

export function inClientFilter(client: FilterFields, filter: ClientFilter): boolean {
  if (filter === "upcoming") return client.nextTrip !== null;
  if (filter === "none") return client.tripCount === 0;
  return true;
}

/** Counts per filter, for the segment labels ("All 24"). */
export function filterCounts(clients: readonly FilterFields[]): Record<ClientFilter, number> {
  const counts: Record<ClientFilter, number> = { all: 0, upcoming: 0, none: 0 };
  for (const client of clients) {
    for (const { key } of CLIENT_FILTERS) if (inClientFilter(client, key)) counts[key] += 1;
  }
  return counts;
}
