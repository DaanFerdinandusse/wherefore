import { describe, expect, it } from "vitest";

import type { Ask, ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";

import { initialState } from "../workspace/reducer";

import {
  daySentence,
  tasteWords,
  verdictOf,
  briefSentence,
  buildDays,
  coverDates,
  coverFacts,
  dayNote,
  dayStatus,
  dayTitle,
  defaultSlots,
  findingLabel,
  mostCommon,
  openDay,
  partDrop,
  priceLabel,
  slotReasons,
  subLine,
  suggestionHint,
  suggestionsBySlot,
  tasteBadges,
  usesCover,
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
  it("offers breakfast, lunch and dinner, and the last day ends after lunch", () => {
    expect(defaultSlots(1, 5)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(defaultSlots(5, 5)).toEqual(["breakfast", "lunch"]);
    expect(defaultSlots(1, 1)).toEqual(["breakfast", "lunch", "dinner"]);
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
    expect(days[0].slots.map((s) => s.slot)).toEqual(["breakfast", "morning", "lunch", "dinner", "night"]);
    expect(days[0].filled).toBe(3);
    expect(days[0].neighborhood).toBe("Príncipe Real");
    expect(dayTitle(days[0])).toEqual({ lead: "Friday 14 May", place: "Príncipe Real" });
    expect(dayTitle(days[1])).toEqual({ lead: "Saturday 15 May" });
    expect(dayStatus(days[0])).toBe("3 of 5 added");
    expect(dayStatus(days[1])).toBe("Open");
    expect(usesCover(days)).toBe(true);
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
    expect(suggestionHint({ score: 92 })).toBe("Suggested in chat, 92 match. Not added yet.");
    expect(suggestionHint({})).toBe("Suggested in chat. Not added yet.");
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
    expect(days[0].slots.find((s) => s.slot === "breakfast")?.suggestion?.tripPlaceId).toBe("a");
  });

  it("groups a day into parts: the meal, then what else is added", () => {
    const state = initialState(
      snapshot({
        places: [card("lunch"), card("museum", { category: "see" }), card("gallery", { category: "see" })],
        slots: [
          slot(1, "lunch", "lunch"),
          slot(1, "afternoon", "museum"),
          slot(1, "afternoon", "gallery", { id: "1-afternoon-1", position: 1 }),
        ],
      }),
    );
    const [day] = buildDays(state);
    expect(day.parts.map((p) => p.label)).toEqual(["Morning", "Afternoon", "Night"]);
    const afternoon = day.parts[1];
    expect(afternoon.slots.map((s) => s.card?.tripPlaceId)).toEqual(["lunch", "museum", "gallery"]);
    expect(afternoon.add).toEqual({ day: 1, slot: "afternoon", position: 2 });
    expect(day.parts[0].slots.map((s) => s.slot)).toEqual(["breakfast"]);
    expect(day.filled).toBe(3);
  });

  it("has no night on the last day of a longer trip until a place is added to it", () => {
    const days = buildDays(initialState(snapshot({ places: [card("bar", { category: "drink" })], slots: [slot(5, "night", "bar")] })));
    expect(days[4].parts.map((p) => p.part)).toEqual(["morning", "afternoon", "night"]);
    expect(buildDays(initialState(snapshot()))[4].parts.map((p) => p.part)).toEqual(["morning", "afternoon"]);
  });

  it("drops an open slot row left empty, but keeps one with the advisor's note", () => {
    const days = buildDays(
      initialState(
        snapshot({
          slots: [slot(1, "afternoon"), slot(2, "afternoon", undefined, { note: "Keep this free" })],
        }),
      ),
    );
    expect(days[0].parts[1].slots.map((s) => s.slot)).toEqual(["lunch"]);
    expect(days[1].parts[1].slots.map((s) => s.slot)).toEqual(["lunch", "afternoon"]);
  });

  it("shows a search for an open slot after what is in it", () => {
    const running: Ask = { id: ASK, label: "Museums", status: "running", resultCount: 0, loosened: [], target: { day: 1, slot: "afternoon" } };
    const state = initialState(snapshot({ places: [card("museum", { category: "see" })], asks: [running], slots: [slot(1, "afternoon", "museum")] }));
    const afternoon = buildDays(state)[0].parts[1];
    expect(afternoon.slots.map((s) => [s.slot, s.position, !!s.finding])).toEqual([
      ["lunch", 0, false],
      ["afternoon", 0, false],
      ["afternoon", 1, true],
    ]);
  });

  it("suggests the best place of a search for an open slot until one of them is in it", () => {
    const ask: Ask = { id: ASK, label: "Museums", status: "done", resultCount: 2, loosened: [], target: { day: 1, slot: "afternoon" } };
    const places = [
      card("best", { category: "see", score: 90, askIds: [ASK] }),
      card("next", { category: "see", score: 80, askIds: [ASK] }),
    ];
    const open = buildDays(initialState(snapshot({ places, asks: [ask] })))[0].parts[1];
    expect(open.slots.find((s) => s.slot === "afternoon")?.suggestion?.tripPlaceId).toBe("best");
    const added = buildDays(initialState(snapshot({ places, asks: [ask], slots: [slot(1, "afternoon", "best")] })))[0].parts[1];
    expect(added.slots.filter((s) => s.suggestion)).toEqual([]);
  });

  it("says what a search for an open slot is finding", () => {
    expect(findingLabel("dinner")).toBe("Finding dinner in the chat");
    expect(findingLabel("afternoon")).toBe("Finding something for the afternoon in the chat");
  });

  it("suggests only a place the slot may hold", () => {
    const ask: Ask = { id: ASK, label: "Afternoon", status: "done", resultCount: 2, loosened: [], target: { day: 1, slot: "afternoon" } };
    const places = [card("food", { score: 99, askIds: [ASK] }), card("museum", { category: "see", score: 50, askIds: [ASK] })];
    const afternoon = buildDays(initialState(snapshot({ places, asks: [ask] })))[0].parts[1];
    expect(afternoon.slots.find((s) => s.slot === "afternoon")?.suggestion?.tripPlaceId).toBe("museum");
  });

  it("finds the most common value, ties to the earliest", () => {
    expect(mostCommon(["Chiado", "Alfama", "Alfama", undefined, " "])).toBe("Alfama");
    expect(mostCommon(["Chiado", "Alfama"])).toBe("Chiado");
    expect(mostCommon([])).toBeUndefined();
  });
});

describe("cover and brief", () => {
  it("lists dates, travelers, the stay, and what is added and open", () => {
    const state = initialState(
      snapshot({ places: [card("h", { category: "stay", name: "Valverde" })], slots: [slot(1, "stay", "h")] }),
    );
    const facts = coverFacts(state.trip, state.travelers, buildDays(state));
    expect(facts).toEqual({
      dates: "Fri 14 to Tue 18 May · 4 nights",
      travelers: "Ana and Clara",
      stay: "Staying at Valverde",
      progress: "1 added · 14 open",
    });
  });

  it("writes the brief sentence from facts only", () => {
    const state = initialState(snapshot());
    expect(briefSentence(state.trip, state.travelers, buildDays(state))).toBe(
      "Ana and Clara, 2 adults. Fri 14 to Tue 18 May. Nothing added yet: tell me what Ana wants and I start with one slot.",
    );
    const one = initialState(snapshot({ places: [card("a")], slots: [slot(1, "dinner", "a")] }, { party: undefined }));
    expect(briefSentence(one.trip, one.travelers, buildDays(one))).toBe("Ana and Clara. Fri 14 to Tue 18 May. 1 of 14 slots added.");
  });
});

describe("a place in a slot", () => {
  it("writes the type line with the local price sign", () => {
    expect(subLine({ category: "eat", neighborhood: "Chiado", priceLevel: 3 }, "PT")).toBe("Restaurant · Chiado · €€€");
    expect(subLine({ category: "drink" }, "MX")).toBe("Bar");
    expect(priceLabel(2, "GB")).toBe("££");
    expect(priceLabel(undefined, "PT")).toBeNull();
  });

  it("takes the first shared taste tags as badges", () => {
    const sharedTags = ["Stylish", " Romantic ", "", "Social", "Cozy"].map((name, i) => ({ tagId: `t${i}`, name }));
    expect(tasteBadges({ sharedTags })).toEqual(["Stylish", "Romantic", "Social"]);
    expect(tasteBadges({ sharedTags: [] })).toEqual([]);
  });

  it("gathers the note, favorites, dishes and review mentions a row opens to", () => {
    const reasons = slotReasons(
      {
        score: 85,
        dishes: ["Oysters", "Carabineiro prawns", "Fish by weight", "Bread"],
        keywords: [
          { name: "Pour-over", count: 96 },
          { name: "Rare", count: 2 },
          { name: "Pastries", count: 40 },
          { name: "Bar seating", count: 12 },
        ],
        because: [
          { entityId: "E2", name: "Lilia", share: 18 },
          { entityId: "E1", name: "Death & Co", share: 82 },
          { entityId: "E3", name: "None", share: 0 },
        ],
      },
      "Ana Ruiz",
      { slotNote: { note: " Go before 1 pm. ", noteSource: "advisor" }, favoriteImages: new Map([["E1", "https://img/1.jpg"]]) },
    );
    expect(reasons).toEqual({
      title: "Why Ana",
      score: 85,
      note: { text: "Go before 1 pm.", label: "Your note on Ana" },
      favorites: [
        { entityId: "E1", name: "Death & Co", share: 82, imageUrl: "https://img/1.jpg" },
        { entityId: "E2", name: "Lilia", share: 18 },
      ],
      order: ["Oysters", "Carabineiro prawns", "Fish by weight"],
      mentions: ["96 reviews mention pour-over", "40 reviews mention pastries"],
    });
  });

  it("keeps an artist marked, so its name opens no place", () => {
    const reasons = slotReasons({ because: [{ entityId: "E9", name: "Khruangbin", share: 12, media: true }] }, "Ana Ruiz");
    expect(reasons?.favorites).toEqual([{ entityId: "E9", name: "Khruangbin", share: 12, media: true }]);
  });

  it("never quotes an agent note, falls back to the saved place note, and is empty without facts", () => {
    const base = { because: [] };
    expect(slotReasons({ ...base, score: 85 }, "Ana", { slotNote: { note: "Agent wrote this", noteSource: "agent" } })).toBeNull();
    expect(slotReasons({ ...base, yourPlace: { advisorPlaceId: "p", note: "Ask for the counter" } }, "Ana")?.note).toEqual({
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

describe("the agent's reasoning in the itinerary", () => {
  const card = (name: string, category: TripPlaceCard["category"], tags: string[]): TripPlaceCard =>
    ({
      tripPlaceId: name,
      placeId: name,
      entityId: name,
      name,
      category,
      because: [],
      sharedTags: tags.map((tag) => ({ tagId: tag, name: tag })),
      status: "added",
      source: "ask",
      askIds: [],
    }) as TripPlaceCard;

  it("reads a place's latest line from whichever search weighed it", () => {
    const line = (good: string) => ({ tripPlaceId: "a", stand: "pick" as const, good, rest: "", catch: false });
    expect(verdictOf({ one: { verdicts: [line("First.")] }, two: { verdicts: [line("Second.")] }, three: {} }, "a")?.good).toBe("Second.");
    expect(verdictOf({}, "a")).toBeUndefined();
  });

  it("says a day in one sentence, in the client's taste", () => {
    const day = {
      slots: [
        { day: 1, slot: "breakfast" as const, position: 0, card: card("The Folks", "coffee", ["Cozy"]) },
        { day: 1, slot: "dinner" as const, position: 0, card: card("Da Noi", "eat", ["Italian", "Cozy"]) },
        { day: 1, slot: "night" as const, position: 0, card: card("Red Frog", "drink", ["Intimate"]) },
      ],
    };
    expect(daySentence(day)).toBe("A cozy breakfast, an Italian dinner, then intimate drinks.");
  });

  it("never uses a taste word twice in a day", () => {
    const day = {
      slots: [
        { day: 1, slot: "lunch" as const, position: 0, card: card("Leonetta", "eat", ["Cozy", "Italian"]) },
        { day: 1, slot: "dinner" as const, position: 0, card: card("Memoria", "eat", ["Cozy", "Italian", "Chic"]) },
      ],
    };
    expect(daySentence(day)).toBe("An Italian lunch, then a cozy dinner.");
  });

  it("does not call one place a day", () => {
    expect(daySentence({ slots: [{ day: 1, slot: "dinner", position: 0, card: card("Da Noi", "eat", ["Cozy"]) }] })).toBeNull();
  });

  it("leaves the hotel out of the day", () => {
    const day = {
      slots: [
        { day: 1, slot: "lunch" as const, position: 0, card: card("Mezze", "eat", []) },
        { day: 1, slot: "dinner" as const, position: 0, card: card("Da Noi", "eat", ["Italian"]) },
        { day: 1, slot: "stay" as const, position: 0, card: card("Hotel", "stay", ["Chic"]) },
      ],
    };
    expect(daySentence(day)).toBe("A good lunch, then an Italian dinner.");
  });

  it("lists the taste the places deliver, most delivered first", () => {
    const days = [
      {
        slots: [
          { day: 1, slot: "lunch" as const, position: 0, card: card("A", "eat", ["Cozy", "Italian"]) },
          { day: 1, slot: "dinner" as const, position: 0, card: card("B", "eat", ["Cozy"]) },
        ],
      },
    ];
    expect(tasteWords(days)).toEqual(["Cozy", "Italian"]);
  });
});

describe("suggestions after the agent has weighed", () => {
  const place = (tripPlaceId: string, score: number): TripPlaceCard =>
    ({ tripPlaceId, placeId: tripPlaceId, entityId: tripPlaceId, name: tripPlaceId, category: "eat", score, because: [], sharedTags: [], status: "suggested", source: "ask", askIds: ["ask"] }) as TripPlaceCard;
  const verdict = (tripPlaceId: string, stand: "pick" | "backup" | "out") => ({ tripPlaceId, stand, good: "", rest: "", catch: false });
  const state = (places: TripPlaceCard[], verdicts: ReturnType<typeof verdict>[], pick?: string) => ({
    ...initialState({ trip: { id: "t", startDate: "2026-05-14", endDate: "2026-05-16" }, travelers: [], places: [], asks: [], slots: [] } as unknown as TripSnapshot),
    places: Object.fromEntries(places.map((p) => [p.tripPlaceId, p])),
    asks: { ask: { id: "ask", label: "Dinner", status: "done", resultCount: 3, loosened: [], target: { day: 1, slot: "dinner" as const }, verdicts, ...(pick ? { pickTripPlaceId: pick } : {}) } as Ask },
  });

  it("offers the backup once the pick has gone elsewhere, never a rejected place", () => {
    const picked = { ...place("pick", 94), status: "added" } as TripPlaceCard;
    const suggestions = suggestionsBySlot(state([picked, place("backup", 80), place("rejected", 90)], [verdict("pick", "pick"), verdict("backup", "backup"), verdict("rejected", "out")], "pick"));
    expect([...suggestions.values()].map((c) => c.tripPlaceId)).toEqual(["backup"]);
  });

  it("offers nothing when only rejected places are left", () => {
    expect(suggestionsBySlot(state([place("rejected", 90)], [verdict("rejected", "out")])).size).toBe(0);
  });
});

describe("partDrop", () => {
  const afternoon = { day: 2, slot: "afternoon" as const };
  const drag = { category: "see" as const, from: null, rowTakes: false };

  it("arms a new row when no row under the pointer takes the place", () => {
    expect(partDrop(afternoon, drag)).toBe("armed");
    expect(partDrop(afternoon, { ...drag, from: { day: 1, slot: "afternoon" } })).toBe("armed");
    expect(partDrop(afternoon, { ...drag, from: { day: 2, slot: "morning" } })).toBe("armed");
  });

  it("offers the new row next to a row that takes the place", () => {
    expect(partDrop(afternoon, { ...drag, rowTakes: true })).toBe("offered");
  });

  it("offers no new row to a card from the same open slot", () => {
    expect(partDrop(afternoon, { ...drag, from: afternoon })).toBe("none");
    expect(partDrop(afternoon, { ...drag, from: afternoon, rowTakes: true })).toBe("none");
  });

  it("offers a new row to a cafe leaving the meal of the same part", () => {
    expect(partDrop(afternoon, { ...drag, category: "coffee", from: { day: 2, slot: "lunch" } })).toBe("armed");
  });

  it("refuses what the open slot may not hold, unless a row takes it", () => {
    expect(partDrop(afternoon, { ...drag, category: "eat" })).toBe("refused");
    expect(partDrop(afternoon, { ...drag, category: "stay" })).toBe("refused");
    expect(partDrop(afternoon, { ...drag, category: "eat", rowTakes: true })).toBe("none");
  });

  it("takes a drag that names no category", () => {
    expect(partDrop(afternoon, { ...drag, category: null })).toBe("armed");
  });
});
