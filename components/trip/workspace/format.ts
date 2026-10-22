// Copy helpers for the workspace: dates, day labels, type lines, the
// "Because Ana loves ..." line and the board subtitle from built_from. Pure,
// and only ever built from data we have (no invented facts).

import type { BuiltFrom, Category, Explainability, SlotName, TripSnapshot } from "@/lib/contracts";
import { favoriteDrivers } from "@/lib/qloo/normalize";

export const SLOT_LABELS: Record<SlotName, string> = {
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  night: "Night",
  stay: "Stay",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return { weekday: WEEKDAYS[d.getUTCDay()], day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()] };
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "14 to 18 May · 4 nights", "30 Apr to 2 May · 2 nights", or "Dates not set". */
export function datesLabel(trip: Pick<TripSnapshot["trip"], "startDate" | "endDate">): string {
  if (!trip.startDate) return "Dates not set";
  const a = parts(trip.startDate);
  if (!trip.endDate) return `From ${a.day} ${a.month}`;
  const b = parts(trip.endDate);
  const nights = Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86_400_000);
  const range = a.month === b.month ? `${a.day} to ${b.day} ${b.month}` : `${a.day} ${a.month} to ${b.day} ${b.month}`;
  return `${range} · ${nights} ${nights === 1 ? "night" : "nights"}`;
}

/** "Fri 14 May" */
export function shortDate(iso: string): string {
  const p = parts(iso);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "Day 1 · Fri 14 May", or "Day 1" without dates. */
export function dayLabel(day: number, date?: string): string {
  return date ? `Day ${day} · ${shortDate(date)}` : `Day ${day}`;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  eat: "Food",
  drink: "Drinks",
  coffee: "Coffee",
  see: "See",
  stay: "Stay",
  other: "Place",
};

export const TAB_LABELS = { all: "All", eat: "Eat", drink: "Drink", coffee: "Coffee", see: "See", stay: "Stay" } as const;

/** "Drinks · Principe Real": our category and the provider's neighborhood. */
export function typeLine(card: { category: Category; neighborhood?: string }): string {
  return [CATEGORY_LABELS[card.category], card.neighborhood].filter(Boolean).join(" · ");
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The favorites a place is credited to by name: never "Your places" or "Other favorites". */
export function namedDrivers(because: Explainability): Explainability {
  return favoriteDrivers(because);
}

/** "Because Ana loves Via Carota and Lilia", from the top two named drivers. Empty without one. */
export function becauseLine(because: Explainability, clientName: string): string {
  const top = namedDrivers(because)
    .sort((a, b) => b.share - a.share)
    .slice(0, 2)
    .map((d) => d.name)
    .filter(Boolean);
  if (top.length === 0) return "";
  return `Because ${firstName(clientName)} loves ${joinNames(top)}`;
}

/**
 * The board subtitle: "From Ana's 6 favorites and your 11 Lisbon places.
 * Clara has none yet." Falls back to the travelers' favorite counts.
 */
export function builtFromLine(
  builtFrom: BuiltFrom | undefined,
  destinationName: string,
  travelers: TripSnapshot["travelers"],
): string {
  const sources: string[] = [];
  const favorites =
    builtFrom?.favorites.map((f) => ({ name: f.clientName, count: f.names.length })) ??
    travelers.filter((t) => t.favoritesCount > 0).map((t) => ({ name: t.name, count: t.favoritesCount }));
  for (const f of favorites) {
    if (f.count > 0) sources.push(`${firstName(f.name)}'s ${f.count} ${f.count === 1 ? "favorite" : "favorites"}`);
  }
  const advisorCount = builtFrom?.advisorPlaceCount ?? 0;
  if (advisorCount > 0) sources.push(`your ${advisorCount} ${destinationName} ${advisorCount === 1 ? "place" : "places"}`);
  const lines: string[] = [];
  if (sources.length > 0) lines.push(`From ${joinNames(sources)}.`);
  const without = (builtFrom?.companionsWithoutFavorites ?? []).map(firstName);
  if (without.length > 0) lines.push(`${joinNames(without)} ${without.length === 1 ? "has" : "have"} none yet.`);
  return lines.join(" ");
}

/** "Natural wine" from "Natural wine · Sat": the board title for an ask tab. */
export function askTitle(label: string): string {
  return label.split(" · ")[0] || label;
}
