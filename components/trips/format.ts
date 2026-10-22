// Pure labels for trip cards and the trip bar. Dates are ISO days
// ("2027-05-14") and are read in UTC, so a label never shifts a day.

import type { TripCard } from "@/lib/trips/contracts";
import { daysBetween } from "@/lib/trips/stage";

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

type Parts = { year: number; month: number; day: number };

function parts(iso: string): Parts {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: month - 1, day };
}

/** "Ana" from "Ana Ruiz"; the whole name when it has one word. */
export function firstName(name: string): string {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

/**
 * The short range on cards and in the trip bar: "14 to 18 May", "28 May to
 * 2 Jun", "28 Dec 2026 to 2 Jan 2027", "From 14 May". Null without dates.
 */
export function tripDatesLabel(startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  if (!startDate) return null;
  const a = parts(startDate);
  if (!endDate || endDate === startDate) {
    return endDate ? `${a.day} ${MONTHS_SHORT[a.month]}` : `From ${a.day} ${MONTHS_SHORT[a.month]}`;
  }
  const b = parts(endDate);
  if (a.year !== b.year) {
    return `${a.day} ${MONTHS_SHORT[a.month]} ${a.year} to ${b.day} ${MONTHS_SHORT[b.month]} ${b.year}`;
  }
  if (a.month !== b.month) return `${a.day} ${MONTHS_SHORT[a.month]} to ${b.day} ${MONTHS_SHORT[b.month]}`;
  return `${a.day} to ${b.day} ${MONTHS_SHORT[a.month]}`;
}

/** The dates corner of a card: the range, or "Sep 2026" once the trip is done. */
export function cardDatesLabel(card: Pick<TripCard, "stage" | "startDate" | "endDate">): string {
  if (card.stage === "done" && card.startDate) return monthYearLabel(card.startDate);
  return tripDatesLabel(card.startDate, card.endDate) ?? "Dates not set";
}

/** "Sep 2026", for finished trips. */
export function monthYearLabel(iso: string): string {
  const { year, month } = parts(iso);
  return `${MONTHS_SHORT[month]} ${year}`;
}

/** "March 2026", for "went before" suggestions. */
export function longMonthYearLabel(iso: string): string {
  const { year, month } = parts(iso);
  return `${MONTHS[month]} ${year}`;
}

/** "14 Sep". */
export function dayMonthLabel(iso: string): string {
  const { month, day } = parts(iso);
  return `${day} ${MONTHS_SHORT[month]}`;
}

/** Nights between two ISO days; 0 when the end is not after the start. */
export function nightsCount(startDate: string, endDate: string): number {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function nightsLabel(startDate: string, endDate: string): string {
  const n = nightsCount(startDate, endDate);
  return `${n} ${n === 1 ? "night" : "nights"}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Day of the trip today (1 based), or null when today is outside the dates. */
export function tripDayToday(trip: { startDate: string | null; endDate: string | null }, today: string): number | null {
  if (!trip.startDate || today < trip.startDate) return null;
  if (trip.endDate && today > trip.endDate) return null;
  return daysBetween(trip.startDate, today);
}

/** Days from today until the start date (1 = tomorrow), or null when not ahead. */
export function daysUntil(startDate: string | null, today: string): number | null {
  if (!startDate || startDate <= today) return null;
  return nightsCount(today, startDate);
}

export type CardStatus = {
  text: string;
  /** 0..1 for the progress bar, or null for no bar. */
  progress: number | null;
  tone: "plain" | "strong" | "warning";
  barTone?: "ink" | "green";
};

/**
 * The bottom line of a trip card. Only facts from the row: seed state, places,
 * filled days and the dates.
 */
export function cardStatus(card: TripCard, today: string): CardStatus {
  const { places, days, emptyDays } = card.counts;
  const filledDays = Math.max(0, days - emptyDays);

  if (card.seedStatus === "failed") {
    return { text: "Could not build the first list", progress: null, tone: "warning" };
  }
  if (card.seedStatus === "running") {
    return { text: "Building the first list", progress: null, tone: "plain" };
  }

  if (card.stage === "done") {
    const finished = card.endDate ?? card.startDate;
    const head = finished ? `Finished ${dayMonthLabel(finished)}` : "Finished";
    return { text: `${head} · ${plural(places, "place")}`, progress: null, tone: "plain" };
  }

  if (card.stage === "traveling") {
    const day = tripDayToday(card, today);
    if (day !== null) {
      return { text: `Day ${day} of ${days}`, progress: Math.min(1, day / days), tone: "plain", barTone: "green" };
    }
    return { text: plural(places, "place"), progress: null, tone: "plain" };
  }

  if (places === 0) {
    return card.stage === "planning"
      ? { text: "No places yet", progress: 0, tone: "plain", barTone: "ink" }
      : { text: "No places yet", progress: null, tone: "plain" };
  }

  const filled = `${filledDays} of ${days} days filled`;
  if (card.stage === "shared") {
    return { text: `${plural(places, "place")} · ${filled}`, progress: null, tone: "plain" };
  }
  return { text: `${plural(places, "place")} · ${filled}`, progress: filledDays / days, tone: "plain", barTone: "ink" };
}
