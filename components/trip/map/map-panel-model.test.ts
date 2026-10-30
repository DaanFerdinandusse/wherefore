import { describe, expect, it } from "vitest";

import type { Ask, ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";

import { buildDays } from "../itinerary-view/itinerary-model";
import { initialState } from "../workspace/reducer";

import {
  dayChips,
  mapBar,
  mapPlaces,
  mapSearches,
  mapSuggestion,
  placeBar,
  searchesByTime,
  regionAsk,
  searchRow,
  searchTime,
  suggestionTitle,
  topKeyword,
  type MapSearch,
} from "./map-panel-model";

const ASK = "11111111-1111-4111-8111-111111111111";
const HERE = { lat: 19.4, lon: -99.1 };

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
    const suggestion = mapSuggestion(d, "all");
    expect(suggestion?.suggestion.tripPlaceId).toBe("s");
    expect(suggestion && suggestionTitle(suggestion)).toBe("Suggested for Day 2 lunch");
    expect(mapSuggestion(d, 1)).toBeNull();
  });

  describe("searches", () => {
    const ask = (id: string, label: string, status: Ask["status"] = "done"): Ask => ({ id, label, status, resultCount: 0, loosened: [] });
    const search = (id: string): MapSearch => ({ id, label: id, running: false, places: [], photos: [], time: null });

    it("lists them newest first, with only the places the map can pin, best match first", () => {
      const places = [
        card("low", { ...HERE, askIds: ["cafes"], score: 60, imageUrl: "low.jpg" }),
        card("high", { ...HERE, askIds: ["cafes", "dinner"], score: 90 }),
        card("gone", { ...HERE, askIds: ["cafes"], status: "removed" }),
        card("nowhere", { askIds: ["cafes"] }),
      ];
      const found = mapSearches([ask("cafes", "Cafes"), ask("dinner", "Dinner · Sat")], places);
      expect(found.map((s) => s.id)).toEqual(["dinner", "cafes"]);
      expect(found[1]?.places.map((p) => p.tripPlaceId)).toEqual(["high", "low"]);
      expect(found[1]?.photos).toEqual(["low.jpg"]);
    });

    it("keeps a running search with no places yet and drops a finished one", () => {
      const found = mapSearches([ask("failed", "Failed", "failed"), ask("done", "Empty"), ask("running", "Running", "running")], []);
      expect(found.map((s) => s.id)).toEqual(["running"]);
      expect(found[0]?.running).toBe(true);
    });

    it("hands the map to a search, with the whole itinerary as context", () => {
      const d = days({
        places: [card("a"), card("b"), card("r"), card("s", { askIds: [ASK], score: 94 })],
        slots: [slot(1, "morning", "a"), slot(2, "dinner", "b")],
        asks: [{ id: ASK, label: "Lunch", status: "done", resultCount: 1, loosened: [], target: { day: 2, slot: "lunch" } }],
      });
      const on: MapSearch = { ...search("cafes"), places: [card("r")] };
      expect(mapPlaces(d, 1, undefined, on).map((p) => p.tripPlaceId)).toEqual(["r", "a", "b"]);
    });

    it("offers only a suggestion that came from the search on the map", () => {
      const d = days({
        places: [card("s", { askIds: [ASK], score: 94 })],
        asks: [{ id: ASK, label: "Lunch", status: "done", resultCount: 1, loosened: [], target: { day: 2, slot: "lunch" } }],
      });
      expect(mapSuggestion(d, "all", search("cafes"))).toBeNull();
      expect(mapSuggestion(d, 1, { ...search("lunch"), places: [card("s")] })?.suggestion.tripPlaceId).toBe("s");
    });

    it("reads the time of a search from its slot, else from its label", () => {
      expect(searchTime({ label: "Tacos", target: { day: 1, slot: "lunch" } })).toBe("lunch");
      expect(searchTime({ label: "Breakfast options" })).toBe("breakfast");
      expect(searchTime({ label: "Saturday morning walk" })).toBe("morning");
      expect(searchTime({ label: "Dinner options, dinner after" })).toBe("dinner");
      expect(searchTime({ label: "Hotel in Polanco" })).toBeNull();
      expect(searchTime({ label: "Hotel", target: { day: 1, slot: "stay" } })).toBeNull();
      expect(searchTime({ label: "Nightlife in Roma" })).toBeNull();
    });

    it("lists by time of day, then trip day, with searches that have no time last", () => {
      const at = (id: string, time: MapSearch["time"], day?: number): MapSearch => ({
        ...search(id),
        time,
        ...(day ? { target: { day, slot: time ?? "stay" } } : {}),
      });
      const newestFirst = [
        at("breakfast options", "morning"),
        at("mon lunch", "lunch", 3),
        at("mon dinner", "dinner", 3),
        at("quieter sun", "morning", 2),
        at("sun morning", "morning", 2),
        at("sat lunch", "lunch", 1),
        at("hotel", null),
      ];
      expect(searchesByTime(newestFirst).map((s) => s.id)).toEqual([
        "quieter sun",
        "sun morning",
        "breakfast options",
        "sat lunch",
        "mon lunch",
        "mon dinner",
        "hotel",
      ]);
      expect(newestFirst[0]?.id).toBe("breakfast options");
    });

    it("splits a label into what and when for the list", () => {
      const places = [card("a"), card("b")];
      expect(searchRow({ label: "Dinner options · Mon dinner", running: false, places })).toEqual({
        title: "Dinner options",
        detail: "Mon dinner · 2 places",
      });
      expect(searchRow({ label: "Hotel in Polanco", running: false, places: [card("a")] })).toEqual({ title: "Hotel in Polanco", detail: "1 place" });
      expect(searchRow({ label: "Cafes", running: true, places: [] }).detail).toBe("Searching");
    });

    it("carries the search on the map into a region search", () => {
      expect(regionAsk({ label: "Natural wine bars", running: false, places: [] })).toBe("natural wine bars");
      expect(regionAsk({ label: "Places · Map region", running: false, places: [] })).toBe("places");
    });

    it("keeps a region search to the slot, without saying the meal twice", () => {
      const lunch = { day: 2, slot: "lunch" } as const;
      expect(regionAsk({ label: "Lunch · Sat lunch", running: false, places: [], target: lunch })).toBe("lunch on day 2");
      expect(regionAsk({ label: "Dinner options · Map region", running: false, places: [], target: { day: 3, slot: "dinner" } })).toBe(
        "dinner options on day 3",
      );
      expect(regionAsk({ label: "Seafood · Sat lunch", running: false, places: [], target: lunch })).toBe("seafood for day 2 lunch");
    });
  });

  describe("the bar", () => {
    const lunch: Ask = { id: ASK, label: "Lunch", status: "done", resultCount: 2, loosened: [], target: { day: 2, slot: "lunch" } };
    const result = (id: string, target?: MapSearch["target"]): MapSearch => ({
      id: ASK,
      label: "Lunch",
      running: false,
      places: [card(id)],
      photos: [],
      time: null,
      ...(target ? { target } : {}),
    });

    it("says which day a place is on and offers no slot", () => {
      const d = days({ places: [card("a", { status: "added" })], slots: [slot(3, "dinner", "a")] });
      expect(placeBar(d, card("a"), undefined, { day: 1, slot: "lunch" })).toEqual({ kind: "added", place: card("a"), title: "On Day 3 dinner" });
    });

    it("offers the slot the search was for, even for a result the chat did not pick", () => {
      const d = days({ places: [card("best", { askIds: [ASK], score: 90 }), card("other", { askIds: [ASK], score: 70 })], asks: [lunch] });
      const bar = placeBar(d, card("other"), result("other", { day: 2, slot: "lunch" }), { day: 1, slot: "lunch" });
      expect(bar).toMatchObject({ kind: "add", title: "Suggested for Day 2 lunch", day: 2, slot: "lunch" });
    });

    it("skips the search's slot once it is filled", () => {
      const d = days({ places: [card("a", { status: "added" }), card("r")], slots: [slot(2, "lunch", "a")] });
      const bar = placeBar(d, card("r"), result("r", { day: 2, slot: "lunch" }), { day: 3, slot: "lunch" });
      expect(bar).toMatchObject({ kind: "add", title: "Day 3 lunch is open", day: 3, slot: "lunch", position: 0 });
    });

    it("says so when no slot is free", () => {
      expect(placeBar(days({}), card("r"), undefined, null)).toMatchObject({ kind: "full" });
    });

    it("shows the picked place over the first suggestion, and nothing when there is neither", () => {
      const d = days({ places: [card("s", { askIds: [ASK], score: 94 }), card("r")], asks: [lunch] });
      expect(mapBar(d, "all", undefined, undefined, null)?.place.tripPlaceId).toBe("s");
      expect(mapBar(d, "all", card("r"), undefined, null)?.place.tripPlaceId).toBe("r");
      expect(mapBar(d, 1, undefined, undefined, null)).toBeNull();
    });
  });

  it("reads the top keyword with its mentions", () => {
    expect(topKeyword({ keywords: [{ name: "tuna tostadas", count: 312 }] })).toEqual({ name: "Tuna tostadas", mentions: "312 mentions" });
    expect(topKeyword({})).toBeNull();
  });
});
