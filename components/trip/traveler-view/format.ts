import type { SharedTripDay, SharedTripPlace, SharedTripSlot, SharedTripView, SlotName } from "@/lib/contracts";
import { OTHER_FAVORITES_NAME } from "@/lib/qloo/normalize";

// Pure helpers for the traveler view. Everything the page says about a place
// comes from the shared view (names, explainability, tags, advisor notes);
// these only pick and format it. Dates are ISO days ("2026-11-12") read in
// UTC so a label never shifts with the viewer's time zone.

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
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const DAY_MS = 86_400_000;
/** A guard against a bad date range turning into thousands of free days. */
const MAX_DAYS = 60;

function parseDay(iso: string | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A favorite the traveler can be told about: a real name. The shared view
 * carries no entity ids, and the server already drops the "Other favorites"
 * bucket; its name is filtered too for views written before that.
 */
function isNamedFavorite(item: { name: string }): boolean {
  const name = item.name.trim();
  return name !== "" && name !== OTHER_FAVORITES_NAME;
}

/** "Because you love Via Carota and Lilia": the top two favorites by share. Null without any. */
export function becauseLine(because: SharedTripPlace["because"]): string | null {
  const names = because
    .filter(isNamedFavorite)
    .sort((a, b) => b.share - a.share)
    .slice(0, 2)
    .map((item) => item.name.trim());
  if (names.length === 0) return null;
  return `Because you love ${names.join(" and ")}`;
}

/** "12 to 16 November", "28 November to 2 December", years only when the range crosses one. */
export function dateRangeLabel(startDate?: string, endDate?: string): string | null {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (!start) return null;
  const startDay = start.getUTCDate();
  const startMonth = MONTHS[start.getUTCMonth()];
  if (!end || end.getTime() <= start.getTime()) return `${startDay} ${startMonth}`;
  const endText = `${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${startDay} ${startMonth} ${start.getUTCFullYear()} to ${endText} ${end.getUTCFullYear()}`;
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) return `${startDay} ${startMonth} to ${endText}`;
  return `${startDay} to ${endText}`;
}

/** "Thursday 12 November", or "Day 3" when the trip has no dates. */
export function dayHeading(day: { day: number; date?: string }): string {
  const date = parseDay(day.date);
  if (!date) return `Day ${day.day}`;
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

const SLOT_LABELS: Record<SlotName, string> = {
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  night: "Night",
  stay: "Stay",
};

export function slotLabel(slot: SlotName): string {
  return SLOT_LABELS[slot];
}

/**
 * Every day of the trip in order, the empty ones included (with no slots),
 * so the page can show them as free days. The count comes from the dates
 * when both are set, else from the last planned day.
 */
export function travelerDays(view: Pick<SharedTripView, "startDate" | "endDate" | "days">): SharedTripDay[] {
  const byDay = new Map(view.days.map((day) => [day.day, day]));
  const lastPlanned = view.days.reduce((max, day) => Math.max(max, day.day), 0);
  const start = parseDay(view.startDate);
  const end = parseDay(view.endDate);
  const fromDates = start && end && end >= start ? Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1 : 0;
  const count = Math.min(Math.max(fromDates, lastPlanned), MAX_DAYS);
  const days: SharedTripDay[] = [];
  for (let n = 1; n <= count; n++) {
    const planned = byDay.get(n);
    const date = planned?.date ?? (start ? isoOf(new Date(start.getTime() + (n - 1) * DAY_MS)) : undefined);
    days.push({ day: n, ...(date ? { date } : {}), slots: planned?.slots ?? [] });
  }
  return days;
}

export type DayGroup =
  | { kind: "planned"; day: SharedTripDay }
  | { kind: "free"; days: SharedTripDay[] };

/** Planned days stand alone; runs of free days are grouped so they sit side by side. */
export function groupDays(days: SharedTripDay[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const day of days) {
    if (day.slots.length > 0) {
      groups.push({ kind: "planned", day });
      continue;
    }
    const last = groups.at(-1);
    if (last?.kind === "free") last.days.push(day);
    else groups.push({ kind: "free", days: [day] });
  }
  return groups;
}

/** The day's most frequent neighborhoods, up to two: "Roma Norte" or "Roma Norte and Condesa". */
export function dayNeighborhoods(slots: SharedTripSlot[]): string | null {
  const counts = new Map<string, number>();
  for (const slot of slots) {
    const name = slot.place?.neighborhood?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
  return top.length > 0 ? top.join(" and ") : null;
}

/** The first place photo in itinerary order: the hero of the page. */
export function heroImage(view: Pick<SharedTripView, "days">): { src: string; alt: string } | null {
  for (const day of view.days) {
    for (const slot of day.slots) {
      if (slot.place?.imageUrl) return { src: slot.place.imageUrl, alt: slot.place.name };
    }
  }
  return null;
}

export function placeCount(view: Pick<SharedTripView, "days">): number {
  return view.days.reduce((sum, day) => sum + day.slots.filter((slot) => slot.place).length, 0);
}

/**
 * The traveler's favorites that drove the picks, most influential first,
 * summed over every place in the itinerary. Names only, from explainability.
 */
export function favoritesBehind(view: Pick<SharedTripView, "days">, limit = 5): string[] {
  const totals = new Map<string, number>();
  for (const day of view.days) {
    for (const slot of day.slots) {
      for (const item of slot.place?.because ?? []) {
        if (!isNamedFavorite(item)) continue;
        const name = item.name.trim();
        totals.set(name, (totals.get(name) ?? 0) + item.share);
      }
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

/** "Via Carota", "Via Carota and Lilia", "Via Carota, Lilia and Attaboy". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const NUMBER_WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
] as const;

/** "Eight places, picked for you by Daan." Plain counts, no claims beyond the itinerary. */
export function heroSummary(view: Pick<SharedTripView, "days" | "advisorName">): string {
  const count = placeCount(view);
  const countText = NUMBER_WORDS[count] ?? String(count);
  const places = `${countText} ${count === 1 ? "place" : "places"}`;
  const advisor = view.advisorName?.trim();
  return advisor ? `${places}, picked for you by ${advisor}.` : `${places}, picked for you.`;
}

/** The Open Graph description: "Daan planned your Mexico City days, 12 to 16 November, from the places you already love." */
export function shareDescription(
  view: Pick<SharedTripView, "advisorName" | "destinationName" | "startDate" | "endDate">,
): string {
  const dates = dateRangeLabel(view.startDate, view.endDate);
  const advisor = view.advisorName?.trim();
  const what = `your ${view.destinationName} days${dates ? `, ${dates},` : ""}`;
  return advisor
    ? `${advisor} planned ${what} from the places you already love.`
    : `Here are ${what} planned from the places you already love.`;
}
