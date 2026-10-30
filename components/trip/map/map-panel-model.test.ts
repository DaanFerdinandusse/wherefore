import { describe, expect, it } from "vitest";

import type { Ask, ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";

import { buildDays } from "../itinerary-view/itinerary-model";
import { initialState } from "../workspace/reducer";

import { dayChips, mapPlaces, mapSuggestion, suggestionTitle, topKeyword } from "./map-panel-model";

const ASK = "11111111-1111-4111-8111-111111111111";

function card(id: string, patch: Partial<TripPlaceCard> = {}): TripPlaceCard {
  return {
    tripPlaceId: id,
    placeId: `place-${id}`,
    entityId: `entity-${id}`,
    name: `Place ${id}`,
    category: "eat",
    because: [],
    sharedTags: [],
    status: "suggested",
    source: "seed",
    askIds: [],
    ...patch,
  };
}

const slot = (day: number, name: ItinerarySlot["slot"], tripPlaceId?: string): ItinerarySlot => ({
  id: `${day}-${name}`,
  day,
  slot: name,
  tripPlaceId,
  note: "",
  position: 0,
});

function days(patch: Partial<TripSnapshot>, selectedPlaceId: string | null = null) {
  const snapshot: TripSnapshot = {
    trip: {
      id: "trip",
      title: "Mexico City for Ana",
      clientId: "client",
      clientName: "Ana Ruiz",
      destination: { name: "Mexico City", lat: 19.4, lon: -99.1, radiusM: 8000 },
      startDate: "2026-11-12",
      endDate: "2026-11-14",
      datesMode: "exact",
      stage: "planning",
      seedStatus: "done",
      chatId: "chat",
    },
    travelers: [],
    places: [],
    asks: [],
    slots: [],
    ...patch,
  };
  return buildDays(initialState(snapshot, { selectedPlaceId }));
}

describe("map panel", () => {
  it("names the day chips by weekday", () => {
    expect(dayChips(days({})).map((c) => c.label)).toEqual(["All days", "Thu", "Fri", "Sat"]);
  });

  it("pins the places of the chosen days, the suggestions and the selected place once each", () => {
    const done: Ask = { id: ASK, label: "Lunch", status: "done", resultCount: 1, loosened: [], target: { day: 2, slot: "lunch" } };
    const d = days({
      places: [card("a"), card("b"), card("s", { askIds: [ASK], score: 94 }), card("x")],
      slots: [slot(1, "morning", "a"), slot(2, "dinner", "b")],
      asks: [done],
    });
    const x = card("x");
    expect(mapPlaces(d, "all", x).map((p) => p.tripPlaceId)).toEqual(["a", "b", "s", "x"]);
    expect(mapPlaces(d, 1, undefined).map((p) => p.tripPlaceId)).toEqual(["a"]);
    const suggestion = mapSuggestion(d, "all", null);
    expect(suggestion?.suggestion.tripPlaceId).toBe("s");
    expect(suggestion && suggestionTitle(suggestion)).toBe("Suggested for Day 2 lunch");
    expect(mapSuggestion(d, 1, null)).toBeNull();
  });

  it("reads the top keyword with its mentions", () => {
    expect(topKeyword({ keywords: [{ name: "tuna tostadas", count: 312 }] })).toEqual({ name: "Tuna tostadas", mentions: "312 mentions" });
    expect(topKeyword({})).toBeNull();
  });
});
