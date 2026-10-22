// Pure helpers for the place profile sheet: labels, the slot picker's days and
// default slot, hours rows with the trip days marked, the open state line and
// the "why" sentence. No React, no I/O; tested in profile-format.test.ts.

import type { Category, Explainability, ItinerarySlot, SlotName } from "@/lib/contracts";

export const OTHER_DRIVER_ID = "other";

export const SLOT_LABELS: Record<SlotName, string> = {
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  night: "Night",
  stay: "Stay",
};

/** Slots offered in the picker, in day order. Stay only for places to stay. */
export function pickerSlots(category: Category): SlotName[] {
  return category === "stay" ? ["stay"] : ["morning", "lunch", "afternoon", "dinner", "night"];
}

// Which slots suit a place, best first. The board category decides.
const PREFERRED: Record<Category, SlotName[]> = {
  eat: ["lunch", "dinner"],
  drink: ["night", "dinner"],
  coffee: ["morning", "afternoon"],
  see: ["morning", "afternoon"],
  stay: ["stay"],
  other: ["morning", "lunch", "afternoon", "dinner", "night"],
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTH_LONG = [
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

export const DEFAULT_DAYS = 3;

function utc(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function addDaysIso(iso: string, days: number): string {
  const date = utc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday 1 to Sunday 7, for an ISO day. */
export function isoWeekday(iso: string): number {
  const day = utc(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

export type TripDay = { day: number; date?: string; label: string };

/** The itinerary days: from the trip dates, else three or as many as the slots use. */
export function tripDays(
  trip: { startDate?: string; endDate?: string },
  slots: readonly ItinerarySlot[],
): TripDay[] {
  let count = Math.max(DEFAULT_DAYS, ...slots.map((s) => s.day));
  if (trip.startDate && trip.endDate) {
    count = Math.max(1, Math.round((utc(trip.endDate).getTime() - utc(trip.startDate).getTime()) / 86_400_000) + 1);
  }
  return Array.from({ length: count }, (_, i) => {
    const day = i + 1;
    if (!trip.startDate) return { day, label: `Day ${day}` };
    const date = addDaysIso(trip.startDate, i);
    const d = utc(date);
    return {
      day,
      date,
      label: `Day ${day} · ${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`,
    };
  });
}

export type SlotChoice = { day: number; slot: SlotName };

export function slotChoiceLabel(choice: SlotChoice): string {
  return `Day ${choice.day} · ${SLOT_LABELS[choice.slot]}`;
}

/** Where the place sits in the itinerary already, if anywhere. */
export function currentSlotOf(tripPlaceId: string, slots: readonly ItinerarySlot[]): SlotChoice | null {
  const slot = slots.find((s) => s.tripPlaceId === tripPlaceId);
  return slot ? { day: slot.day, slot: slot.slot } : null;
}

export function isSlotTaken(choice: SlotChoice, slots: readonly ItinerarySlot[]): boolean {
  return slots.some((s) => s.day === choice.day && s.slot === choice.slot && Boolean(s.tripPlaceId));
}

/**
 * The default slot for "Add to itinerary": the first free slot that suits the
 * place's category, day by day; else the first free slot of any kind; else
 * day 1 in the best suited slot.
 */
export function nextFreeSlot(category: Category, days: readonly TripDay[], slots: readonly ItinerarySlot[]): SlotChoice {
  const preferred = PREFERRED[category];
  for (const { day } of days) {
    for (const slot of preferred) if (!isSlotTaken({ day, slot }, slots)) return { day, slot };
  }
  for (const { day } of days) {
    for (const slot of pickerSlots(category)) if (!isSlotTaken({ day, slot }, slots)) return { day, slot };
  }
  return { day: days[0]?.day ?? 1, slot: preferred[0] ?? "morning" };
}

export function priceSigns(level: number | null | undefined): string | null {
  return typeof level === "number" && level >= 1 && level <= 4 ? "$".repeat(level) : null;
}

/** The street part of a full address ("Calle de Durango 200"). */
export function shortAddress(address: string | null | undefined): string | null {
  const first = address?.split(",")[0]?.trim();
  return first ? first : null;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function savedLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `Saved ${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function tripsLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "In 1 trip" : `In ${count} trips`;
}

/** Named drivers only: "Other favorites" is never presented as a favorite. */
export function namedDrivers(because: Explainability): Explainability {
  return because.filter((d) => d.entityId !== OTHER_DRIVER_ID && d.name.trim().length > 0);
}

/**
 * "People who love Via Carota and Lilia in New York also love this place."
 * The two biggest named drivers; the city only when both favorites are in the
 * same one. Null without a named driver.
 */
export function whySentence(
  because: Explainability,
  cities: ReadonlyMap<string, string | null> = new Map(),
): string | null {
  const top = namedDrivers(because).slice(0, 2);
  if (top.length === 0) return null;
  const names = top.map((d) => d.name).join(" and ");
  const placeCities = top.map((d) => cities.get(d.entityId) ?? null);
  const city = placeCities.every((c) => c && c === placeCities[0]) ? placeCities[0] : null;
  return `People who love ${names}${city ? ` in ${city}` : ""} also love this place.`;
}

// Built from char codes so the source stays plain ASCII: narrow no-break,
// thin and no-break spaces; en dash, em dash and hyphen between times.
const ODD_SPACES = new RegExp(`[${String.fromCharCode(0x202f, 0x2009, 0xa0)}]`, "g");
const RANGE_DASH = new RegExp(`\\s*[${String.fromCharCode(0x2013, 0x2014)}-]\\s*`, "g");

/** Google text uses narrow spaces and en dashes; the app writes "1 to 11 pm". */
export function plainHours(text: string): string {
  return text
    .replace(ODD_SPACES, " ")
    .replace(RANGE_DASH, " to ")
    .replace(/:00(?=\s?[AaPp][Mm]|\s|$|,)/g, "")
    .replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase())
    .replace(/\s+/g, " ")
    .trim();
}

export type HoursRow = { weekday: number; label: string; text: string; tripDays: number[] };

const WEEKDAY_FROM_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const LONG_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Trip day numbers per weekday (1 Monday to 7 Sunday). */
export function tripDaysByWeekday(days: readonly TripDay[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const d of days) {
    if (!d.date) continue;
    const weekday = isoWeekday(d.date);
    map.set(weekday, [...(map.get(weekday) ?? []), d.day]);
  }
  return map;
}

/** Rows from Google's weekday descriptions ("Monday: 1:00 – 11:00 PM"). */
export function googleHoursRows(descriptions: readonly string[], days: readonly TripDay[]): HoursRow[] {
  const byWeekday = tripDaysByWeekday(days);
  const rows: HoursRow[] = [];
  for (const line of descriptions) {
    const match = /^([^:]+):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const index = LONG_WEEKDAYS.indexOf(match[1].trim().toLowerCase());
    if (index < 0) continue;
    const weekday = index + 1;
    rows.push({ weekday, label: WEEKDAY_FROM_MONDAY[index], text: plainHours(match[2]), tripDays: byWeekday.get(weekday) ?? [] });
  }
  return rows;
}

/** Rows from the provider's hours (already formatted by the route). */
export function providerHoursRows(hours: readonly { weekday: number; text: string }[], days: readonly TripDay[]): HoursRow[] {
  const byWeekday = tripDaysByWeekday(days);
  return hours
    .filter((h) => h.weekday >= 1 && h.weekday <= 7)
    .map((h) => ({ weekday: h.weekday, label: WEEKDAY_FROM_MONDAY[h.weekday - 1], text: h.text, tripDays: byWeekday.get(h.weekday) ?? [] }));
}

export function hoursRowLabel(row: HoursRow): string {
  if (row.tripDays.length === 0) return row.label;
  const word = row.tripDays.length === 1 ? "Day" : "Days";
  return `${row.label} (${word} ${row.tripDays.join(", ")})`;
}

function minutesOf(hour: string, minute: string | undefined, meridiem: string | undefined, fallback?: string): number | null {
  let h = Number(hour);
  const m = minute ? Number(minute) : 0;
  const mer = (meridiem ?? fallback)?.toLowerCase();
  if (!mer || h > 12) return h <= 24 ? h * 60 + m : null;
  if (mer === "pm" && h !== 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return h * 60 + m;
}

/** "1 pm to 11 pm" or "9 am to 2 pm, 6 to 11 pm" as minute ranges (closing past midnight wraps). */
export function parseRanges(text: string): { open: number; close: number; closeLabel: string }[] {
  const out: { open: number; close: number; closeLabel: string }[] = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
  for (const m of text.matchAll(re)) {
    const close = minutesOf(m[4], m[5], m[6]);
    const open = minutesOf(m[1], m[2], m[3], m[6]);
    if (open === null || close === null) continue;
    const closeLabel = `${Number(m[4])}${m[5] ? `:${m[5]}` : ""}${m[6] ? ` ${m[6].toLowerCase()}` : ""}`;
    out.push({ open, close: close <= open ? close + 24 * 60 : close, closeLabel });
  }
  return out;
}

export type OpenState = { open: boolean; text: string };

/**
 * The open state line: Google's own openNow ("Open now", "Closed now"). The
 * closing time ("Open until 11 pm") is added only when the details carry the
 * place's UTC offset, so the place's local day and time are known; it is
 * never guessed. Several ranges a day: the one that holds the local time.
 */
export function openState(
  input: { openNow?: boolean; openingHours?: readonly string[]; utcOffsetMinutes?: number | null },
  now: Date = new Date(),
): OpenState | null {
  if (input.openNow === undefined) return null;
  if (!input.openNow) return { open: false, text: "Closed now" };
  if (typeof input.utcOffsetMinutes !== "number" || !Number.isFinite(input.utcOffsetMinutes)) {
    return { open: true, text: "Open now" };
  }
  const local = new Date(now.getTime() + input.utcOffsetMinutes * 60_000);
  const weekday = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const line = input.openingHours?.find((l) => l.trim().toLowerCase().startsWith(LONG_WEEKDAYS[weekday - 1]));
  const ranges = line ? parseRanges(plainHours(line.slice(line.indexOf(":") + 1))) : [];
  const current =
    ranges.length === 1 ? ranges[0] : ranges.find((r) => (minute >= r.open && minute < r.close) || minute + 1440 < r.close);
  return current ? { open: true, text: `Open until ${current.closeLabel}` } : { open: true, text: "Open now" };
}

export function directionsUrl(name: string, googlePlaceId: string | null | undefined, address?: string | null): string {
  const params = new URLSearchParams({ api: "1", query: googlePlaceId ? name : [name, address].filter(Boolean).join(", ") });
  if (googlePlaceId) params.set("query_place_id", googlePlaceId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** "5 stars", "1 star". */
export function starsLabel(rating: number): string {
  const r = Math.round(rating);
  return r === 1 ? "1 star" : `${r} stars`;
}
