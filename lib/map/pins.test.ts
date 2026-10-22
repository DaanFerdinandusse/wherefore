import { describe, expect, it } from "vitest";

import type { ItinerarySlot, TripPlaceCard } from "@/lib/contracts";

import { offsetCenter } from "./geo";
import { buildPins, dayByPlace, PIN_SIZES, pinSize, visiblePlaces } from "./pins";

const origin = { lat: 38.7139, lon: -9.1394 };

function card(id: string, dx: number, extra: Partial<TripPlaceCard> = {}): TripPlaceCard {
  const p = offsetCenter(origin, 15, dx, 0);
  return {
    tripPlaceId: id,
    placeId: `p-${id}`,
    entityId: `e-${id}`,
    name: id,
    category: "eat",
    lat: p.lat,
    lon: p.lon,
    score: 80,
    because: [],
    sharedTags: [],
    status: "suggested",
    source: "seed",
    askIds: [],
    ...extra,
  };
}

function slot(day: number, tripPlaceId?: string): ItinerarySlot {
  return { id: `s-${day}-${tripPlaceId}`, day, slot: "lunch", tripPlaceId, note: "", position: 0 };
}

const base = { slots: [], activeTab: "all", activeAskPlaceIds: [], highlightedPlaceId: null, selectedPlaceId: null };

describe("visiblePlaces", () => {
  it("drops removed places and places without coordinates", () => {
    const places = [card("a", 0), card("b", 100, { status: "removed" }), card("c", 200, { lat: undefined })];
    expect(visiblePlaces(places, "all").map((p) => p.tripPlaceId)).toEqual(["a"]);
  });

  it("filters by the category tab and shows everything on an ask tab", () => {
    const places = [card("a", 0), card("b", 100, { category: "drink" })];
    expect(visiblePlaces(places, "drink").map((p) => p.tripPlaceId)).toEqual(["b"]);
    expect(visiblePlaces(places, "ask:1")).toHaveLength(2);
  });
});

describe("dayByPlace", () => {
  it("keeps the first day a place appears on", () => {
    const days = dayByPlace([slot(3, "a"), slot(1, "a"), slot(2, "b"), slot(2)]);
    expect(days.get("a")).toBe(1);
    expect(days.get("b")).toBe(2);
    expect(days.size).toBe(2);
  });
});

describe("pinSize", () => {
  it("follows the size table", () => {
    expect(pinSize("photo", "base", false)).toBe(56);
    expect(pinSize("photo", "ask", false)).toBe(70);
    expect(pinSize("photo", "ask", false)).toBe(PIN_SIZES.photo.base * 1.25);
    expect(pinSize("photo", "faded", false)).toBe(40);
    expect(pinSize("photo", "base", true)).toBe(76);
    expect(pinSize("photo", "ask", true)).toBe(88);
    expect(pinSize("dot", "base", false)).toBe(34);
    expect(pinSize("number", "base", false)).toBe(28);
  });
});

describe("buildPins", () => {
  it("numbers itinerary places by day and keeps suggested places as photos", () => {
    const pins = buildPins({ ...base, places: [card("a", 0), card("b", 300)], slots: [slot(2, "b")] }, 15);
    const a = pins.find((p) => p.id === "a")!;
    const b = pins.find((p) => p.id === "b")!;
    expect(a.visual).toBe("photo");
    expect(b.visual).toBe("number");
    expect(b.day).toBe(2);
  });

  it("glows ask results and fades the rest on an ask tab", () => {
    const pins = buildPins(
      { ...base, places: [card("a", 0), card("b", 300)], activeTab: "ask:x", activeAskPlaceIds: ["a"] },
      15,
    );
    expect(pins.find((p) => p.id === "a")).toMatchObject({ tone: "ask", size: 70 });
    expect(pins.find((p) => p.id === "b")).toMatchObject({ tone: "faded", size: 40 });
  });

  it("keeps the selected pin as a large photo on top", () => {
    const pins = buildPins({ ...base, places: [card("a", 0), card("b", 10)], selectedPlaceId: "b" }, 15);
    const top = pins[pins.length - 1];
    expect(top).toMatchObject({ id: "b", selected: true, visual: "photo", size: 76 });
    expect(pins.find((p) => p.id === "a")!.visual).toBe("dot");
  });

  it("marks advisor places", () => {
    const pins = buildPins({ ...base, places: [card("a", 0, { yourPlace: { advisorPlaceId: "x", note: "" } })] }, 15);
    expect(pins[0].advisor).toBe(true);
  });
});
