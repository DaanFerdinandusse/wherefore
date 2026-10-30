// Pin rules for the Discover map: which places get a pin, what kind, how big,
// and in what order they stack. Sizes come from the Paper artboards 02b, F8
// and F7b (base photo pin 56, ask result 70 = 1.25x, selected 76 / 88).

import type { Category, ItinerarySlot, TripPlaceCard } from "@/lib/contracts";

import { declutter, type DeclutterPin, type PinVisual } from "./declutter";

export type PinTone = "base" | "ask" | "faded";

/** Diameters in px of the main disc of each pin, by visual and tone. */
export const PIN_SIZES = {
  photo: { base: 56, ask: 70, faded: 40, selected: 76, askSelected: 88 },
  dot: { base: 34, ask: 42, faded: 30 },
  number: { base: 28, ask: 35, faded: 28 },
} as const;

/** The highlighted pin (hover from chat, board or map) grows by this factor. */
export const HIGHLIGHT_SCALE = 1.25;

export type PinModel = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  imageUrl?: string;
  score?: number;
  /** One of the advisor's own places: shows the bookmark mark. */
  advisor: boolean;
  /** Itinerary day for a place in a slot; numbered ink pins show it. */
  day?: number;
  visual: PinVisual;
  tone: PinTone;
  selected: boolean;
  highlighted: boolean;
  /** Diameter of the main disc in px, before the highlight scale. */
  size: number;
  zIndex: number;
  /** Numbered pins: room for the name pill next to the number. */
  showName: boolean;
};

export type PinInput = {
  places: TripPlaceCard[];
  slots: ItinerarySlot[];
  activeTab: string;
  activeAskPlaceIds: string[];
  highlightedPlaceId: string | null;
  selectedPlaceId: string | null;
};

const CATEGORIES: readonly Category[] = ["eat", "drink", "coffee", "see", "stay", "other"];

export function isAskTab(tab: string): tab is `ask:${string}` {
  return tab.startsWith("ask:");
}

/**
 * Places that get a pin: not removed, with coordinates, and in the active
 * category when a category tab is on. An ask tab shows every place (the
 * others fade).
 */
export function visiblePlaces(places: TripPlaceCard[], activeTab: string): (TripPlaceCard & { lat: number; lon: number })[] {
  const category = (CATEGORIES as readonly string[]).includes(activeTab) ? activeTab : null;
  return places.filter(
    (p): p is TripPlaceCard & { lat: number; lon: number } =>
      p.status !== "removed" &&
      typeof p.lat === "number" &&
      typeof p.lon === "number" &&
      (category === null || p.category === category),
  );
}

/** The first itinerary day each trip place is in. */
export function dayByPlace(slots: ItinerarySlot[]): Map<string, number> {
  const days = new Map<string, number>();
  for (const s of slots) {
    if (!s.tripPlaceId) continue;
    const current = days.get(s.tripPlaceId);
    if (current === undefined || s.day < current) days.set(s.tripPlaceId, s.day);
  }
  return days;
}

export function pinSize(visual: PinVisual, tone: PinTone, selected: boolean): number {
  if (visual === "photo") {
    if (selected) return tone === "ask" ? PIN_SIZES.photo.askSelected : PIN_SIZES.photo.selected;
    return PIN_SIZES.photo[tone];
  }
  return PIN_SIZES[visual][tone];
}

function priorityOf(p: { selected: boolean; highlighted: boolean; tone: PinTone; day?: number; advisor: boolean; score?: number }) {
  let priority = p.score ?? 0;
  if (p.advisor) priority += 50;
  if (p.day !== undefined) priority += 400;
  if (p.tone === "ask") priority += 500;
  if (p.tone === "faded") priority -= 200;
  if (p.highlighted) priority += 900;
  if (p.selected) priority += 1000;
  return priority;
}

/** Every pin for the current state and zoom, decluttered, in stacking order. */
export function buildPins(input: PinInput, zoom: number): PinModel[] {
  const ask = isAskTab(input.activeTab);
  const askIds = new Set(input.activeAskPlaceIds);
  const days = dayByPlace(input.slots);

  const drafts = visiblePlaces(input.places, input.activeTab).map((card) => {
    const tone: PinTone = !ask ? "base" : askIds.has(card.tripPlaceId) ? "ask" : "faded";
    const selected = card.tripPlaceId === input.selectedPlaceId;
    const highlighted = card.tripPlaceId === input.highlightedPlaceId;
    const day = days.get(card.tripPlaceId);
    const draft = {
      card,
      tone,
      selected,
      highlighted,
      day,
      advisor: Boolean(card.yourPlace),
      score: card.score,
    };
    return { ...draft, priority: priorityOf(draft) };
  });

  const layout = declutter(
    drafts.map(
      (d): DeclutterPin => ({
        id: d.card.tripPlaceId,
        lat: d.card.lat,
        lon: d.card.lon,
        kind: d.day !== undefined ? "itinerary" : "suggested",
        priority: d.priority,
        keepPhoto: d.selected || d.highlighted,
        size: d.day !== undefined ? pinSize("number", d.tone, false) : pinSize("photo", d.tone, d.selected),
        name: d.card.name,
      }),
    ),
    zoom,
  );

  return drafts
    .map((d): PinModel => {
      const { visual, showName } = layout[d.card.tripPlaceId];
      return {
        id: d.card.tripPlaceId,
        lat: d.card.lat,
        lon: d.card.lon,
        name: d.card.name,
        imageUrl: d.card.imageUrl,
        score: d.score,
        advisor: d.advisor,
        day: d.day,
        visual,
        tone: d.tone,
        selected: d.selected,
        highlighted: d.highlighted,
        size: pinSize(visual, d.tone, d.selected),
        // An ask result stays above the rest even when it collapsed to a dot.
        zIndex: Math.round(d.priority) + (visual === "photo" || d.tone === "ask" ? 2000 : visual === "number" ? 1000 : 0),
        showName,
      };
    })
    .sort((a, b) => a.zIndex - b.zIndex);
}
