import { describe, expect, it } from "vitest";

import type { Ask, ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";

import { initialState } from "../workspace/reducer";

import {
  briefSentence,
  buildDays,
  coverDates,
  coverFacts,
  dayNote,
  dayStatus,
  dayTitle,
  defaultSlots,
  findingLabel,
  headline,
  mostCommon,
  openDay,
  orderItems,
  priceLabel,
  slotChip,
  slotList,
  subLine,
  suggestionHint,
  suggestionsBySlot,
  usesCards,
  whyBox,
} from "./itinerary-model";

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

function slot(day: number, name: ItinerarySlot["slot"], tripPlaceId?: string, patch: Partial<ItinerarySlot> = {}): ItinerarySlot {
  return { id: `${day}-${name}`, day, slot: name, tripPlaceId, note: "", position: 0, ...patch };
}

function snapshot(patch: Partial<TripSnapshot> = {}, trip: Partial<TripSnapshot["trip"]> = {}): TripSnapshot {
  return {
    trip: {
      id: "trip",
      title: "Lisbon for Ana",
      clientId: "client",
      clientName: "Ana Ruiz",
      destination: { name: "Lisbon", lat: 38.7, lon: -9.1, radiusM: 8000, countryCode: "PT" },
      startDate: "2027-05-14",
      endDate: "2027-05-18",
      datesMode: "exact",
      stage: "planning",
      seedStatus: "done",
      chatId: "chat",
      party: { adults: 2, children: 0 },
      ...trip,
    },
    travelers: [
      { id: "t1", name: "Ana Ruiz", role: "client", favoritesCount: 2 },
      { id: "t2", name: "Clara", role: "guest", favoritesCount: 0 },
    ],
    places: [],
    asks: [],
    slots: [],
    ...patch,
  };
}

describe("dates", () => {
  it("writes the cover range with weekdays and nights", () => {
    expect(coverDates("2027-05-14", "2027-05-18")).toBe("Fri 14 to Tue 18 May · 4 nights");
    expect(coverDates("2027-04-30", "2027-05-02")).toBe("Fri 30 Apr to Sun 2 May · 2 nights");
    expect(coverDates(undefined, undefined)).toBeNull();
  });
});

describe("days", () => {
  it("offers morning, lunch and dinner, and the last day ends after lunch", () => {
    expect(defaultSlots(1, 5)).toEqual(["morning", "lunch", "dinner"]);
    expect(defaultSlots(5, 5)).toEqual(["morning", "lunch"]);
    expect(defaultSlots(1, 1)).toEqual(["morning", "lunch", "dinner"]);
    expect(slotList(defaultSlots(2, 5))).toBe("Morning, lunch, dinner");
    expect(dayNote(1, 5)).toBe("Day 1 · Arrival");
    expect(dayNote(5, 5)).toBe("Day 5 · Departure");
    expect(dayNote(3, 5)).toBe("Day 3");
  });

  it("builds every day with its slots, the places in them and the day's neighborhood", () => {
    const state = initialState(
      snapshot({
        places: [
          card("a", { category: "coffee", neighborhood: "Príncipe Real" }),
          card("b", { neighborhood: "Chiado" }),
          card("c", { neighborhood: "Príncipe Real" }),
        ],
        slots: [slot(1, "morning", "a"), slot(1, "lunch", "b"), slot(1, "night", "c")],
      }),
    );
    const days = buildDays(state);
    expect(days).toHaveLength(5);
    expect(days[0].slots.map((s) => s.slot)).toEqual(["morning", "lunch", "dinner", "night"]);
    expect(days[0].filled).toBe(3);
    expect(days[0].neighborhood).toBe("Príncipe Real");
    expect(dayTitle(days[0])).toEqual({ lead: "Friday", place: "Príncipe Real" });
    expect(dayTitle(days[1])).toEqual({ lead: "Saturday" });
    expect(dayStatus(days[0])).toBe("3 of 4 picked");
    expect(dayStatus(days[1])).toBe("Open");
    expect(usesCards(days)).toBe(true);
  });

  it("titles a day without dates by its number", () => {
    const days = buildDays(initialState(snapshot({}, { startDate: undefined, endDate: undefined })));
    expect(dayTitle(days[0])).toEqual({ lead: "Day 1" });
  });

  it("marks a slot an ask is running for, then shows its best place as the suggestion", () => {
    const running: Ask = { id: ASK, label: "Seafood", status: "running", resultCount: 2, loosened: [], target: { day: 1, slot: "dinner" } };
    const places = [card("a", { askIds: [ASK], score: 88 }), card("b", { askIds: [ASK], score: 92 })];
    let days = buildDays(initialState(snapshot({ places, asks: [running] })));
    const dinner = days[0].slots.find((s) => s.slot === "dinner");
    expect(dinner?.finding?.id).toBe(ASK);
    expect(findingLabel("dinner")).toBe("Finding dinner in the chat");
    expect(openDay(days)).toBe(1);

    days = buildDays(initialState(snapshot({ places, asks: [{ ...running, status: "done" }] })));
    expect(days[0].slots.find((s) => s.slot === "dinner")?.suggestion?.tripPlaceId).toBe("b");
    expect(suggestionHint({ score: 92 })).toBe("92 match. Add it from the card, or drag it here.");
    expect(suggestionHint({})).toBe("Add it from the card, or drag it here.");
  });

  it("does not suggest a place for a filled slot or a removed place", () => {
    const done: Ask = { id: ASK, label: "Seafood", status: "done", resultCount: 1, loosened: [], target: { day: 1, slot: "dinner" } };
    const filled = buildDays(
      initialState(snapshot({ places: [card("a", { askIds: [ASK] }), card("x")], asks: [done], slots: [slot(1, "dinner", "x")] })),
    );
    expect(filled[0].slots.find((s) => s.slot === "dinner")?.suggestion).toBeUndefined();
    const removed = buildDays(initialState(snapshot({ places: [card("a", { askIds: [ASK], status: "removed" })], asks: [done] })));
    expect(removed[0].slots.find((s) => s.slot === "dinner")?.suggestion).toBeUndefined();
  });

  it("suggests the place open in the chat for its next free slot", () => {
    const state = initialState(snapshot({ places: [card("a", { category: "coffee" })] }), { selectedPlaceId: "a" });
    const days = buildDays(state);
    expect(days[0].slots.find((s) => s.slot === "morning")?.suggestion?.tripPlaceId).toBe("a");
  });

  it("finds the most common value, ties to the earliest", () => {
    expect(mostCommon(["Chiado", "Alfama", "Alfama", undefined, " "])).toBe("Alfama");
    expect(mostCommon(["Chiado", "Alfama"])).toBe("Chiado");
    expect(mostCommon([])).toBeUndefined();
  });
});

describe("cover and brief", () => {
  it("lists dates, travelers, the stay and open slots", () => {
    const state = initialState(
      snapshot({ places: [card("h", { category: "stay", name: "Valverde" })], slots: [slot(1, "stay", "h")] }),
    );
    const facts = coverFacts(state.trip, state.travelers, buildDays(state));
    expect(facts).toEqual({
      dates: "Fri 14 to Tue 18 May · 4 nights",
      travelers: "Ana and Clara",
      stay: "Staying at Valverde",
      open: "14 slots open",
    });
  });

  it("writes the brief sentence from facts only", () => {
    const state = initialState(snapshot());
    expect(briefSentence(state.trip, state.travelers, buildDays(state))).toBe(
      "Ana and Clara, 2 adults. Fri 14 to Tue 18 May. Nothing picked yet: tell me what Ana wants and I start with one slot.",
    );
    const one = initialState(snapshot({ places: [card("a")], slots: [slot(1, "dinner", "a")] }, { party: undefined }));
    expect(briefSentence(one.trip, one.travelers, buildDays(one))).toBe("Ana and Clara. Fri 14 to Tue 18 May. 1 of 14 slots picked.");
  });
});

describe("a place card", () => {
  it("says which favorite the place is like before who its fans are", () => {
    const via = { entityId: "E1", name: "Via Carota", share: 27 };
    const lilia = { entityId: "E2", name: "Lilia", share: 25, tags: ["Italian", "Warm", "Stylish"] };
    expect(headline({ because: [via, lilia] })).toBe("Like Lilia: Italian, warm, stylish");
    // A dish or a keyword still comes first.
    expect(headline({ dishes: ["Oysters"], because: [via, lilia] })).toBe("For the oysters");
    expect(headline({ keywords: [{ name: "Tinned fish", count: 132 }], because: [via, lilia] })).toBe("Known for tinned fish");
    expect(headline({ because: [via, { ...lilia, tags: ["Warm"] }] })).toBe("Via Carota fans come here");
    expect(headline({ because: [{ entityId: "trip-picks", name: "This trip's picks", share: 90, tags: ["Warm", "Cozy"] }, via] })).toBe(
      "Via Carota fans come here",
    );
    const long = { entityId: "E3", name: "Le Châteaubriand", share: 25, tags: ["Gastronomic", "Minimalist", "Stylish"] };
    expect(headline({ because: [long] })).toBe("Like Le Châteaubriand: gastronomic, minimalist");
    expect(headline({ because: [{ ...long, name: "A Very Long Favorite Name Of A Restaurant Here" }] })).toBe(
      "A Very Long Favorite Name Of A Restaurant Here fans come here",
    );
  });

  it("leads with a dish, then a keyword, then a favorite, else nothing", () => {
    expect(headline({ dishes: ["Oysters"], keywords: [{ name: "fish", count: 50 }], because: [] })).toBe("For the oysters");
    expect(headline({ keywords: [{ name: "Tinned fish", count: 132 }], because: [] })).toBe("Known for tinned fish");
    expect(headline({ keywords: [{ name: "rare", count: 1 }], because: [{ entityId: "E1", name: "Devoción", share: 70 }] })).toBe(
      "Devoción fans come here",
    );
    expect(headline({ because: [] })).toBeNull();
    expect(headline({ dishes: ["Sweet Onions Cooked In Whey Comte Cheese", "Le Steak"], because: [] })).toBe("For the le steak");
    expect(headline({ dishes: ["Sweet Onions Cooked In Whey Comte Cheese"], keywords: [{ name: "mole", count: 9 }], because: [] })).toBe(
      "Known for mole",
    );
  });

  it("lists dishes to order, at most three", () => {
    expect(orderItems({ dishes: ["Oysters", "Carabineiro prawns", "Fish by weight", "Bread"] })).toEqual([
      "Oysters",
      "Carabineiro prawns",
      "Fish by weight",
    ]);
    expect(orderItems({})).toEqual([]);
  });

  it("writes the chip and the type line with the local price sign", () => {
    expect(slotChip("morning", "coffee")).toBe("Morning · Coffee");
    expect(subLine({ category: "eat", neighborhood: "Chiado", priceLevel: 3 }, "PT")).toBe("Restaurant · Chiado · €€€");
    expect(subLine({ category: "drink" }, "MX")).toBe("Bar");
    expect(priceLabel(2, "GB")).toBe("££");
    expect(priceLabel(undefined, "PT")).toBeNull();
  });

  it("builds the Why box from the note, favorites, keywords and shared tags", () => {
    const box = whyBox(
      {
        keywords: [{ name: "Pour-over", count: 96 }],
        because: [
          { entityId: "E1", name: "Death & Co", share: 82 },
          { entityId: "E2", name: "Lilia", share: 18 },
        ],
        sharedTags: [
          { tagId: "t1", name: "Intimate" },
          { tagId: "t2", name: "Natural wine" },
          { tagId: "t3", name: "Loud" },
        ],
      },
      "Ana Ruiz",
      { slotNote: { note: "Pour-over, every morning", noteSource: "advisor" }, favoriteImages: new Map([["E1", "https://img/1.jpg"]]) },
    );
    expect(box).toEqual({
      title: "Why Ana",
      note: { text: "Pour-over, every morning", label: "Your note on Ana" },
      lines: [
        { kind: "favorite", entityId: "E1", text: "Death & Co fans go here, 82%", imageUrl: "https://img/1.jpg" },
        { kind: "favorite", entityId: "E2", text: "Lilia fans too, 18%" },
        { kind: "keyword", text: "96 reviews mention pour-over" },
        { kind: "shares", text: "Shares: intimate, natural wine" },
      ],
    });
  });

  it("never quotes an agent note, falls back to the saved place note, and is empty without facts", () => {
    const base = { because: [], sharedTags: [] };
    expect(whyBox(base, "Ana", { slotNote: { note: "Agent wrote this", noteSource: "agent" } })).toBeNull();
    expect(whyBox({ ...base, yourPlace: { advisorPlaceId: "p", note: "Ask for the counter" } }, "Ana")?.note).toEqual({
      text: "Ask for the counter",
      label: "Your note on this place",
    });
  });
});


describe("recommended slot pick", () => {
  it("keeps the agent pick even when another result has a higher score", () => {
    const state = initialState(snapshot({
      asks: [{ id: ASK, label: "Dinner", status: "done", resultCount: 2, loosened: [], target: { day: 1, slot: "dinner" }, pickTripPlaceId: "picked" }],
      places: [card("highest", { score: 99, askIds: [ASK] }), card("picked", { score: 85, askIds: [ASK] })],
    }));
    expect([...suggestionsBySlot(state).values()].map((p) => p.tripPlaceId)).toEqual(["picked"]);
  });
});
