// Pure helpers for the place card in the chat (Paper J1, J1b, J1c): review
// keyword bars, the slot's day of Google hours and whether the place is open
// for the slot, Google's price range and reservations in words, reviews
// newest first with keyword highlights, and the one line of a collapsed pick.
// No React, no I/O; tested in card-format.test.ts.

import type { Explainability, ItinerarySlot, PlaceKeyword, SlotName } from "@/lib/contracts";
import type { GoogleReview } from "@/lib/google/contracts";

import { firstName, namedDrivers, parseRanges, plainHours } from "./profile-format";

export const MAX_KEYWORDS = 5;

export type KeywordBar = { name: string; count: number; width: number; top: boolean };

/** The most mentioned review keywords as bars; the width is relative to the first. */
export function keywordBars(keywords: readonly PlaceKeyword[] | undefined, max = MAX_KEYWORDS): KeywordBar[] {
  const sorted = [...(keywords ?? [])].filter((k) => k.name && k.count > 0).sort((a, b) => b.count - a.count).slice(0, max);
  const most = sorted[0]?.count ?? 0;
  return sorted.map((k, i) => ({ name: k.name, count: k.count, width: most ? Math.max(4, Math.round((k.count / most) * 100)) : 0, top: i === 0 }));
}

const LONG_WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utcDay(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

/** "Fri 14 May" for an ISO date. */
export function shortDateLabel(iso: string): string | null {
  const d = utcDay(iso);
  return d ? `${SHORT_WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : null;
}

export type DayHours = { weekday: string; text: string; closed: boolean };

/** Google's hours for the weekday of `date` ("Friday: 7:00 – 11:30 PM" as "7 to 11:30 pm"). */
export function hoursOnDate(openingHours: readonly string[] | undefined, date: string | undefined): DayHours | null {
  if (!openingHours?.length || !date) return null;
  const d = utcDay(date);
  if (!d) return null;
  const long = LONG_WEEKDAYS[d.getUTCDay()]!;
  const line = openingHours.find((l) => l.trim().toLowerCase().startsWith(long));
  if (!line) return null;
  // "7 pm to 11:30 pm" reads as "7 to 11:30 pm".
  const text = plainHours(line.slice(line.indexOf(":") + 1)).replace(
    /(\d{1,2}(?::\d{2})?) (am|pm) to (\d{1,2}(?::\d{2})?) \2/g,
    "$1 to $3 $2",
  );
  const closed = /^closed$/i.test(text);
  return { weekday: SHORT_WEEKDAYS[d.getUTCDay()]!, text: closed ? "Closed" : text, closed };
}

// The hours a slot covers, in minutes from midnight. A guide for "open for
// the slot", not a booking time: the place only has to be open for part of it.
const SLOT_WINDOWS: Record<SlotName, [number, number] | null> = {
  breakfast: [7 * 60, 11 * 60],
  morning: [9 * 60, 12 * 60],
  lunch: [12 * 60, 15 * 60],
  afternoon: [14 * 60, 18 * 60],
  dinner: [19 * 60, 22 * 60],
  night: [21 * 60, 25 * 60],
  stay: null,
};

/** Open for part of the slot (true), closed for all of it (false), or unknown (null). */
export function openForSlot(hours: DayHours | null, slot: SlotName): boolean | null {
  const window = SLOT_WINDOWS[slot];
  if (!hours || !window) return null;
  if (hours.closed) return false;
  if (/open 24 hours/i.test(hours.text)) return true;
  const ranges = parseRanges(hours.text);
  if (ranges.length === 0) return null;
  const [from, to] = window;
  return ranges.some((r) => r.open < to && r.close > from);
}

/** "€20 to €30 per person" from Google's price range; null when Google has none. */
export function priceRangeLabel(range: { currency: string; start?: number; end?: number } | undefined): string | null {
  if (!range) return null;
  let format: (n: number) => string;
  try {
    const nf = new Intl.NumberFormat("en-US", { style: "currency", currency: range.currency, maximumFractionDigits: 0 });
    format = (n) => nf.format(n);
  } catch {
    format = (n) => `${n} ${range.currency}`;
  }
  if (range.start !== undefined && range.end !== undefined) return `${format(range.start)} to ${format(range.end)} per person`;
  if (range.start !== undefined) return `From ${format(range.start)} per person`;
  if (range.end !== undefined) return `Up to ${format(range.end)} per person`;
  return null;
}

/** Google's "reservable" in words, or null when Google does not say. */
export function reservationLine(reservable: boolean | undefined): string | null {
  if (reservable === true) return "Takes reservations";
  if (reservable === false) return "No reservations";
  return null;
}

/** Reviews with text, newest first (by publish time; unknown times last, in Google's order). */
export function reviewsNewestFirst(reviews: readonly GoogleReview[] | undefined): GoogleReview[] {
  const withText = (reviews ?? []).filter((r) => r.text?.trim());
  return withText
    .map((review, index) => ({ review, index, time: review.publishTime ? Date.parse(review.publishTime) : Number.NaN }))
    .sort((a, b) => {
      const at = Number.isFinite(a.time) ? a.time : -Infinity;
      const bt = Number.isFinite(b.time) ? b.time : -Infinity;
      return bt - at || a.index - b.index;
    })
    .map((x) => x.review);
}

export type Segment = { text: string; hit: boolean };

/** The text split around whole-word, case-insensitive mentions of the terms. */
export function highlightSegments(text: string, terms: readonly string[]): Segment[] {
  const clean = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 3))].sort((a, b) => b.length - a.length);
  if (clean.length === 0) return [{ text, hit: false }];
  const pattern = new RegExp(`(?<![\\p{L}])(${clean.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}])`, "giu");
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), hit: false });
    out.push({ text: match[0], hit: true });
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length > 0 ? out : [{ text, hit: false }];
}

/** "Rita S." from a Google author name ("Rita Santos"). */
export function shortAuthor(name: string | undefined): string | null {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts.at(-1)![0]!.toUpperCase()}.`;
}

/** Is the place in the slot already? */
export function isInSlot(slots: readonly ItinerarySlot[], tripPlaceId: string, target: { day: number; slot: SlotName }): boolean {
  return slots.some((s) => s.tripPlaceId === tripPlaceId && s.day === target.day && s.slot === target.slot);
}

/**
 * The collapsed pick (S5): "Added to Fri dinner · 92 match · because Ana
 * loves Via Carota", or "Suggested for Fri dinner ..." while it is not in the
 * slot. Parts without a fact are left out.
 */
export function pickLine(input: {
  added: boolean;
  targetLabel?: string;
  score?: number;
  because: Explainability;
  clientName: string;
}): string {
  const where = input.targetLabel ? `${input.added ? "Added to" : "Suggested for"} ${input.targetLabel}` : input.added ? "In the itinerary" : "Recommended";
  const top = namedDrivers(input.because)[0];
  return [
    where,
    input.score !== undefined ? `${input.score} match` : null,
    top ? `because ${firstName(input.clientName)} loves ${top.name}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "+123 photos" for the photos not shown in the strip, or null when all show. */
export function morePhotosLabel(total: number, shown: number): string | null {
  const more = total - shown;
  return more > 0 ? `+${more}` : null;
}
