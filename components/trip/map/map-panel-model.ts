// What the trip panel's map (G2) shows, from the itinerary days: the places
// in the chosen days (numbered by their day), the places the chat suggested
// for open slots in those days, and the place picked on the map. A chat
// search replaces all of that: its places take the map and the itinerary
// stays as context. The bar at the bottom says where the picked place stands:
// on a day, or which open slot it can go in. Pure.

import type { Ask, SlotName, TripPlaceCard } from "@/lib/contracts";
import { slotHolds } from "@/lib/trips/day-parts";

import type { DayView, SlotView } from "../itinerary-view/itinerary-model";
import { weekdayShort } from "../itinerary-view/itinerary-model";
import { SLOT_LABELS } from "../workspace/format";
import { SLOT_ORDER } from "../workspace/reducer";

export type DayFilter = "all" | number;

/** A chat search as the map offers it. `places` are the ones it can pin, best match first. */
export type MapSearch = {
  id: string;
  label: string;
  running: boolean;
  places: TripPlaceCard[];
  /** Up to three photos of its best matches. */
  photos: string[];
  /** The itinerary slot it was for, when the advisor named one. */
  target?: Ask["target"];
  /** The time of day it is about. Null for a search that is only about places ("Hotel in Polanco"). */
  time: SlotName | null;
};

/** The bottom bar: a place on a day, a place with a slot to go in, or one with no slot free. */
export type MapBar =
  | { kind: "added"; place: TripPlaceCard; title: string }
  | { kind: "add"; place: TripPlaceCard; title: string; day: number; slot: SlotName; position: number }
  | { kind: "full"; place: TripPlaceCard; title: string };

/** The slot a place can go in. `position` is the row of an open slot. */
type FreeSlot = { day: number; slot: SlotName; position?: number };

/** "All days", then "Thu", "Fri" (or "Day 1" without dates). */
export function dayChips(days: Pick<DayView, "day" | "date">[]): { value: DayFilter; label: string }[] {
  return [
    { value: "all", label: "All days" },
    ...days.map((d) => ({ value: d.day as DayFilter, label: d.date ? weekdayShort(d.date) : `Day ${d.day}` })),
  ];
}

function inFilter(day: DayView, filter: DayFilter): boolean {
  return filter === "all" || day.day === filter;
}

/**
 * The places to pin, each once: itinerary places, suggestions, then the
 * selected place. With a search on: its places, then the whole itinerary as
 * context, then the selected place.
 */
export function mapPlaces(
  days: DayView[],
  filter: DayFilter,
  selected: TripPlaceCard | undefined,
  search?: MapSearch,
): TripPlaceCard[] {
  const out = new Map<string, TripPlaceCard>();
  for (const place of search?.places ?? []) out.set(place.tripPlaceId, place);
  const shown = search ? days : days.filter((d) => inFilter(d, filter));
  for (const day of shown) {
    for (const s of day.slots) if (s.card && !out.has(s.card.tripPlaceId)) out.set(s.card.tripPlaceId, s.card);
  }
  if (!search) {
    for (const day of shown) {
      for (const s of day.slots) if (s.suggestion && !out.has(s.suggestion.tripPlaceId)) out.set(s.suggestion.tripPlaceId, s.suggestion);
    }
  }
  if (selected && selected.status !== "removed" && !out.has(selected.tripPlaceId)) out.set(selected.tripPlaceId, selected);
  return [...out.values()];
}

/** The first open slot with a suggestion. With a search on, only a suggestion from that search. */
export function mapSuggestion(
  days: DayView[],
  filter: DayFilter,
  search?: MapSearch,
): (SlotView & { suggestion: TripPlaceCard }) | null {
  const results = search ? new Set(search.places.map((p) => p.tripPlaceId)) : null;
  const open = days
    .filter((d) => search || inFilter(d, filter))
    .flatMap((d) => d.slots)
    .filter((s): s is SlotView & { suggestion: TripPlaceCard } => !s.card && !!s.suggestion)
    .filter((s) => !results || results.has(s.suggestion.tripPlaceId));
  return open[0] ?? null;
}

/**
 * What the bar says about a place picked on the map. On a day: which one.
 * Otherwise the slot it can go in: the one its search was for, the one the
 * chat suggested it for, else `free`, the next free slot that suits it.
 */
export function placeBar(
  days: DayView[],
  place: TripPlaceCard,
  search: MapSearch | undefined,
  free: FreeSlot | null,
): MapBar {
  const slots = days.flatMap((d) => d.slots);
  const added = slots.find((s) => s.card?.tripPlaceId === place.tripPlaceId);
  if (added) return { kind: "added", place, title: `On Day ${added.day} ${SLOT_LABELS[added.slot].toLowerCase()}` };
  const target = search?.target;
  const fromSearch =
    target && slotHolds(target.slot, place.category) && search.places.some((p) => p.tripPlaceId === place.tripPlaceId)
      ? (slots.find((s) => !s.card && s.day === target.day && s.slot === target.slot) ??
        days.find((d) => d.day === target.day)?.parts.find((p) => p.add.slot === target.slot)?.add)
      : undefined;
  const suggested = fromSearch ?? slots.find((s) => !s.card && s.suggestion?.tripPlaceId === place.tripPlaceId);
  if (suggested) {
    return { kind: "add", place, title: suggestionTitle(suggested), day: suggested.day, slot: suggested.slot, position: suggested.position };
  }
  if (free) {
    const title = `Day ${free.day} ${SLOT_LABELS[free.slot].toLowerCase()} is open`;
    return { kind: "add", place, title, day: free.day, slot: free.slot, position: free.position ?? 0 };
  }
  return { kind: "full", place, title: "No open slot for this place" };
}

/** The bar: the picked place, else the first suggestion for an open slot. */
export function mapBar(
  days: DayView[],
  filter: DayFilter,
  picked: TripPlaceCard | undefined,
  search: MapSearch | undefined,
  free: FreeSlot | null,
): MapBar | null {
  if (picked) return placeBar(days, picked, search, free);
  const open = mapSuggestion(days, filter, search);
  if (!open) return null;
  return { kind: "add", place: open.suggestion, title: suggestionTitle(open), day: open.day, slot: open.slot, position: open.position };
}

/** Words in a search's label that say when it is for, when it has no target slot. */
const TIME_WORDS: [SlotName, RegExp][] = [
  ["breakfast", /\b(breakfast|brunch)\b/i],
  ["morning", /\bmorning\b/i],
  ["lunch", /\blunch\b/i],
  ["afternoon", /\bafternoon\b/i],
  ["dinner", /\b(dinner|supper|evening)\b/i],
  ["night", /\bnight\b/i],
];

/** The time of day a search is about: its target slot, else a word in its label. A hotel is not a time. */
export function searchTime(ask: Pick<Ask, "label" | "target">): SlotName | null {
  if (ask.target) return ask.target.slot === "stay" ? null : ask.target.slot;
  return TIME_WORDS.find(([, words]) => words.test(ask.label))?.[0] ?? null;
}

/** The full list: morning to night, earlier trip days first, then searches with no time. Ties stay newest first. */
export function searchesByTime(searches: MapSearch[]): MapSearch[] {
  const when = (s: MapSearch) => (s.time ? SLOT_ORDER.indexOf(s.time) : SLOT_ORDER.length);
  const day = (s: MapSearch) => s.target?.day ?? Number.MAX_SAFE_INTEGER;
  return [...searches].sort((a, b) => when(a) - when(b) || day(a) - day(b));
}

/** Searches with something to pin, newest first. `asks` come oldest first. A running one shows while its places arrive. */
export function mapSearches(asks: Ask[], places: TripPlaceCard[]): MapSearch[] {
  return asks
    .flatMap((ask): MapSearch[] => {
      const found = places
        .filter((p) => p.askIds.includes(ask.id) && p.status !== "removed" && typeof p.lat === "number" && typeof p.lon === "number")
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      const running = ask.status === "running";
      if (found.length === 0 && !running) return [];
      const photos = found.flatMap((p) => (p.imageUrl ? [p.imageUrl] : [])).slice(0, 3);
      return [{ id: ask.id, label: ask.label, running, places: found, photos, time: searchTime(ask), ...(ask.target ? { target: ask.target } : {}) }];
    })
    .reverse();
}

/** A row of the full list: "Dinner options" over "Mon dinner · 6 places". */
export function searchRow(search: Pick<MapSearch, "label" | "running" | "places">): { title: string; detail: string } {
  const split = search.label.lastIndexOf(" · ");
  const title = split === -1 ? search.label : search.label.slice(0, split);
  const when = split === -1 ? null : search.label.slice(split + 3);
  const count = search.places.length;
  const found = search.running ? "Searching" : `${count} ${count === 1 ? "place" : "places"}`;
  return { title, detail: when ? `${when} · ${found}` : found };
}

/**
 * What "Search this region" looks for: the same thing as the search on the
 * map, kept to its slot. "lunch on day 2", "seafood for day 2 dinner".
 */
export function regionAsk(search: Pick<MapSearch, "label" | "running" | "places" | "target">): string {
  const { title } = searchRow(search);
  const what = title.charAt(0).toLowerCase() + title.slice(1);
  if (!search.target) return what;
  const slot = SLOT_LABELS[search.target.slot].toLowerCase();
  return what.includes(slot) ? `${what} on day ${search.target.day}` : `${what} for day ${search.target.day} ${slot}`;
}

/** "Suggested for Day 2 lunch" */
export function suggestionTitle(view: Pick<SlotView, "day" | "slot">): string {
  return `Suggested for Day ${view.day} ${SLOT_LABELS[view.slot].toLowerCase()}`;
}

/** The most mentioned review keyword, for "Tuna tostadas · 312 mentions". */
export function topKeyword(card: Pick<TripPlaceCard, "keywords">): { name: string; mentions: string } | null {
  const k = card.keywords?.[0];
  if (!k) return null;
  return { name: k.name.charAt(0).toUpperCase() + k.name.slice(1), mentions: `${k.count} ${k.count === 1 ? "mention" : "mentions"}` };
}
