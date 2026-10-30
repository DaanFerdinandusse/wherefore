// What the trip panel's map (G2) shows, from the itinerary days: the places
// in the chosen days (numbered by their day), the places the chat suggested
// for open slots in those days, the place open in the chat, and the one
// suggestion the bottom card offers. Pure.

import type { TripPlaceCard } from "@/lib/contracts";

import type { DayView, SlotView } from "../itinerary-view/itinerary-model";
import { weekdayShort } from "../itinerary-view/itinerary-model";
import { SLOT_LABELS } from "../workspace/format";

export type DayFilter = "all" | number;

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

/** The places to pin, each once: itinerary places, suggestions, then the selected place. */
export function mapPlaces(
  days: DayView[],
  filter: DayFilter,
  selected: TripPlaceCard | undefined,
): TripPlaceCard[] {
  const out = new Map<string, TripPlaceCard>();
  for (const day of days) {
    if (!inFilter(day, filter)) continue;
    for (const s of day.slots) if (s.card) out.set(s.card.tripPlaceId, s.card);
  }
  for (const day of days) {
    if (!inFilter(day, filter)) continue;
    for (const s of day.slots) if (s.suggestion && !out.has(s.suggestion.tripPlaceId)) out.set(s.suggestion.tripPlaceId, s.suggestion);
  }
  if (selected && selected.status !== "removed" && !out.has(selected.tripPlaceId)) out.set(selected.tripPlaceId, selected);
  return [...out.values()];
}

/** The open slot with a suggestion the bottom card offers: the selected place's slot first. */
export function mapSuggestion(
  days: DayView[],
  filter: DayFilter,
  selectedPlaceId: string | null,
): (SlotView & { suggestion: TripPlaceCard }) | null {
  const open = days
    .filter((d) => inFilter(d, filter))
    .flatMap((d) => d.slots)
    .filter((s): s is SlotView & { suggestion: TripPlaceCard } => !s.card && !!s.suggestion);
  return open.find((s) => s.suggestion.tripPlaceId === selectedPlaceId) ?? open[0] ?? null;
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
