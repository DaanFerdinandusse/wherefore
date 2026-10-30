import { describe, expect, it } from "vitest";

import type { ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";

import {
  activeAskPlaceIds,
  dayCount,
  initialState,
  applySlotWrites,
  liveAsks,
  nextFreeSlot,
  reduce,
  swapWrites,
  tabCounts,
  visiblePlaces,
  writtenNoteSource,
  type WorkspaceState,
} from "./reducer";
import { historyMode, readUrlState, writeUrlState } from "./url-state";

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

function snapshot(patch: Partial<TripSnapshot> = {}, trip: Partial<TripSnapshot["trip"]> = {}): TripSnapshot {
  return {
    trip: {
      id: "trip",
      title: "Lisbon for Ana",
      clientId: "client",
      clientName: "Ana Ruiz",
      destination: { name: "Lisbon", lat: 38.7, lon: -9.1, radiusM: 8000 },
      startDate: "2027-05-14",
      endDate: "2027-05-17",
      datesMode: "exact",
      stage: "planning",
      seedStatus: "done",
      chatId: "chat",
      ...trip,
    },
    travelers: [],
    places: [],
    asks: [],
    slots: [],
    ...patch,
  };
}

const slot = (day: number, name: ItinerarySlot["slot"], tripPlaceId?: string, note = ""): ItinerarySlot => ({
  id: `slot-${day}-${name}`,
  day,
  slot: name,
  tripPlaceId,
  note,
  position: 0,
});

describe("places from the chat", () => {
  it("merges a preliminary output, then the final one, by trip place id", () => {
    let state = initialState(snapshot({ places: [card("a", { score: 80 })] }));
    const meta = { askId: ASK, toolCallId: "call-1", label: "Natural wine · Sat" };

    state = reduce(state, {
      type: "places",
      places: [card("a", { score: 91, source: "ask" }), card("b", { category: "drink", reason: undefined })],
      meta: { ...meta, phase: "searching" },
    });
    expect(Object.keys(state.places)).toEqual(["a", "b"]);
    expect(state.places.a.score).toBe(91);
    expect(state.places.a.askIds).toEqual([ASK]);
    expect(state.asks[ASK]).toMatchObject({ status: "running", resultCount: 2, label: "Natural wine · Sat" });

    // The final output carries reasons and drivers; a missing field keeps what is there.
    state = reduce(state, {
      type: "places",
      places: [
        card("a", { score: undefined, reason: "Natural wine list and a counter.", because: [{ entityId: "e", name: "Lilia", share: 100 }] }),
        card("b", { category: "drink" }),
      ],
      meta: { ...meta, phase: "done", count: 2, elapsedMs: 1400 },
    });
    expect(state.places.a.score).toBe(91);
    expect(state.places.a.reason).toBe("Natural wine list and a counter.");
    expect(state.places.a.because).toHaveLength(1);
    expect(state.asks[ASK]).toMatchObject({ status: "done", resultCount: 2, elapsedMs: 1400 });
  });

  it("never puts a finished ask back into its spinner on a replayed preliminary", () => {
    let state = initialState(snapshot());
    const meta = { askId: ASK, toolCallId: "call-1" };
    state = reduce(state, { type: "places", places: [card("a")], meta: { ...meta, phase: "done" } });
    state = reduce(state, { type: "places", places: [card("a")], meta: { ...meta, phase: "searching" } });
    expect(state.asks[ASK].status).toBe("done");
  });

  it("keeps the workspace's status when a tool output reports an older one", () => {
    let state = initialState(snapshot({ places: [card("a", { status: "added" })], slots: [slot(1, "lunch", "a")] }));
    expect(state.places.a.status).toBe("added");
    state = reduce(state, { type: "places", places: [card("a", { status: "suggested" })], meta: { toolCallId: "t", phase: "done" } });
    expect(state.places.a.status).toBe("added");
  });

  it("moves a pending seed to running when the first seed places stream in", () => {
    let state = initialState(snapshot({}, { seedStatus: "pending" }));
    state = reduce(state, { type: "places", places: [card("a")], meta: { toolCallId: "seed", phase: "searching" } });
    expect(state.trip.seedStatus).toBe("running");
    expect(liveAsks(state)).toHaveLength(0);
  });
});

describe("ask tabs", () => {
  it("creates the ask on its first frame and opens its tab", () => {
    let state = initialState(snapshot({ places: [card("a"), card("c", { category: "see" })] }), { view: "map" });
    state = reduce(state, { type: "places", places: [card("b")], meta: { askId: ASK, toolCallId: "t", phase: "searching" } });
    expect(state.activeTab).toBe(`ask:${ASK}`);
    expect(visiblePlaces(state).map((p) => p.tripPlaceId)).toEqual(["b"]);
    expect(activeAskPlaceIds(state)).toEqual(["b"]);
  });

  it("keeps the slot an ask is for, from the stream or the snapshot", () => {
    let state = initialState(snapshot());
    const meta = { askId: ASK, toolCallId: "t" };
    state = reduce(state, {
      type: "places",
      places: [card("b")],
      meta: { ...meta, phase: "searching", target: { day: 1, slot: "dinner" } },
    });
    expect(state.asks[ASK].target).toEqual({ day: 1, slot: "dinner" });
    state = reduce(state, { type: "places", places: [card("b")], meta: { ...meta, phase: "done" } });
    expect(state.asks[ASK].target).toEqual({ day: 1, slot: "dinner" });
    expect(state.asks[ASK].status).toBe("done");
  });

  it("opens the itinerary by default, and reads the retired board as the itinerary", () => {
    expect(initialState(snapshot()).view).toBe("itinerary");
    expect(initialState(snapshot(), { view: "board" }).view).toBe("itinerary");
  });

  it("does not steal the itinerary view", () => {
    let state = initialState(snapshot(), { view: "itinerary" });
    state = reduce(state, { type: "places", places: [card("b")], meta: { askId: ASK, toolCallId: "t", phase: "searching" } });
    expect(state.activeTab).toBe("all");
  });

  it("archives an ask: the tab hides, the places stay", () => {
    let state = initialState(
      snapshot({
        places: [card("a", { askIds: [ASK] })],
        asks: [{ id: ASK, label: "Natural wine", status: "done", resultCount: 1, loosened: [] }],
      }),
      { activeTab: `ask:${ASK}` },
    );
    state = reduce(state, { type: "archiveAsk", askId: ASK });
    expect(state.activeTab).toBe("all");
    expect(liveAsks(state)).toHaveLength(0);
    expect(state.places.a.askIds).toEqual([]);
    expect(visiblePlaces(state)).toHaveLength(1);
    // Late frames of an archived ask merge places but do not reopen the tab.
    state = reduce(state, { type: "places", places: [card("z")], meta: { askId: ASK, toolCallId: "t", phase: "done" } });
    expect(state.asks[ASK].status).toBe("archived");
    expect(state.places.z).toBeDefined();
  });

  it("falls back to All when a snapshot no longer has the active ask", () => {
    let state = initialState(snapshot({ asks: [{ id: ASK, label: "x", status: "done", resultCount: 0, loosened: [] }] }), {
      activeTab: `ask:${ASK}`,
    });
    expect(state.activeTab).toBe(`ask:${ASK}`);
    state = reduce(state, { type: "snapshot", snapshot: snapshot() });
    expect(state.activeTab).toBe("all");
  });
});

describe("status changes", () => {
  it("adds and clears a slot, keeping trip place statuses in step", () => {
    let state = initialState(snapshot({ places: [card("a"), card("b")] }));
    state = reduce(state, { type: "slot", write: { day: 2, slot: "lunch", tripPlaceId: "a" } });
    expect(state.places.a.status).toBe("added");
    expect(state.slots[0].id).toBe("optimistic:2|lunch|0");

    // Replacing the place in that slot returns the old one to suggested.
    state = reduce(state, { type: "slot", write: { day: 2, slot: "lunch", tripPlaceId: "b" } });
    expect(state.places.a.status).toBe("suggested");
    expect(state.places.b.status).toBe("added");

    state = reduce(state, { type: "slot", write: { day: 2, slot: "lunch", tripPlaceId: null } });
    expect(state.slots).toHaveLength(0);
    expect(state.places.b.status).toBe("suggested");
  });

  it("removing a place empties its slots and hides it from the board", () => {
    let state = initialState(snapshot({ places: [card("a"), card("b")], slots: [slot(1, "dinner", "a", "Book")] }), {
      selectedPlaceId: "a",
    });
    state = reduce(state, { type: "status", tripPlaceId: "a", status: "removed" });
    expect(state.slots[0]).toMatchObject({ tripPlaceId: undefined, note: "Book" });
    expect(state.selectedPlaceId).toBeNull();
    expect(visiblePlaces(state).map((p) => p.tripPlaceId)).toEqual(["b"]);
    expect(tabCounts(state)).toMatchObject({ all: 1, eat: 1 });
  });
});

describe("slots and days", () => {
  it("counts days from the dates, or three plus added days", () => {
    const dated = initialState(snapshot());
    expect(dayCount(dated)).toBe(4);
    let unset = initialState(snapshot({}, { startDate: undefined, endDate: undefined, datesMode: "unset" }));
    expect(dayCount(unset)).toBe(3);
    unset = reduce(unset, { type: "addDay" });
    expect(dayCount(unset)).toBe(4);
    expect(unset.requestedDays).toBe(4);
  });

  it("filling an added day does not add another (requestedDays is absolute)", () => {
    let state = initialState(snapshot({ places: [card("a")] }, { startDate: undefined, endDate: undefined, datesMode: "unset" }));
    state = reduce(state, { type: "addDay" });
    expect(dayCount(state)).toBe(4);
    state = reduce(state, { type: "slot", write: { day: 4, slot: "lunch", tripPlaceId: "a" } });
    expect(dayCount(state)).toBe(4);
    state = reduce(state, { type: "addDay" });
    expect(dayCount(state)).toBe(5);
    // A slot on a later day (from the agent) grows the count; the request is kept.
    state = reduce(state, { type: "slot", write: { day: 7, slot: "dinner", tripPlaceId: "a" } });
    expect(dayCount(state)).toBe(7);
  });

  it("days are the largest of dates, occupied days and the requested count", () => {
    let state = initialState(snapshot({ places: [card("a")], slots: [slot(6, "lunch", "a")] }));
    expect(dayCount(state)).toBe(6);
    state = reduce(state, { type: "addDay" });
    expect(dayCount(state)).toBe(7);
  });

  it("finds the next free slot that suits the category", () => {
    const state = initialState(snapshot({ places: [card("a")], slots: [slot(1, "lunch", "a"), slot(1, "dinner", "a")] }));
    expect(nextFreeSlot(state, "eat")).toEqual({ day: 2, slot: "lunch" });
    expect(nextFreeSlot(state, "coffee")).toEqual({ day: 1, slot: "morning" });
    const full: WorkspaceState = { ...state, slots: [1, 2, 3, 4].map((d) => slot(d, "stay", "a")) };
    expect(nextFreeSlot(full, "stay")).toBeNull();
  });

  it("reorder swaps place, note and traveler flag exactly", () => {
    const slots = [{ ...slot(1, "morning", "a", "Early"), noteForTraveler: true }, slot(1, "afternoon", "b")];
    const writes = swapWrites(slots, { day: 1, slot: "morning" }, { day: 1, slot: "afternoon" });
    expect(writes).toEqual([
      { day: 1, slot: "afternoon", position: 0, tripPlaceId: "a", note: "Early", noteForTraveler: true, noteSource: "advisor" },
      { day: 1, slot: "morning", position: 0, tripPlaceId: "b", note: "", noteForTraveler: false, noteSource: "advisor" },
    ]);
    // The noted place moved over an unnoted one: the note is on one slot only.
    let state = initialState(snapshot({ places: [card("a"), card("b")], slots }));
    for (const write of writes) state = reduce(state, { type: "slot", write });
    expect(state.slots.map((s) => [s.slot, s.tripPlaceId, s.note, s.noteForTraveler])).toEqual([
      ["morning", "b", "", false],
      ["afternoon", "a", "Early", true],
    ]);
    // The server applies the same writes in its replace and lands on the same rows.
    expect(applySlotWrites(slots, writes).map((s) => [s.slot, s.tripPlaceId, s.note, s.noteForTraveler]).sort()).toEqual([
      ["afternoon", "a", "Early", true],
      ["morning", "b", "", false],
    ]);
  });

  it("a move onto a slot without a row takes the source row away", () => {
    const slots = [slot(1, "morning", "a", "Early")];
    const writes = swapWrites(slots, { day: 1, slot: "morning" }, { day: 1, slot: "night" });
    expect(writes[1]).toEqual({ day: 1, slot: "morning", position: 0, tripPlaceId: null });
    const rows = applySlotWrites(slots, writes);
    expect(rows).toEqual([{ day: 1, slot: "night", position: 0, date: null, tripPlaceId: "a", note: "Early", noteForTraveler: false, noteSource: "advisor" }]);
    expect(swapWrites(slots, { day: 1, slot: "lunch" }, { day: 1, slot: "night" })).toEqual([]);
  });

  it("reorder addresses additional positions in a slot", () => {
    const slots = [slot(1, "lunch", "a"), { ...slot(1, "lunch", "b", "Second"), id: "lunch-1", position: 1 }];
    const writes = swapWrites(slots, { day: 1, slot: "lunch", position: 1 }, { day: 1, slot: "dinner" });
    expect(writes[0]).toMatchObject({ slot: "dinner", position: 0, tripPlaceId: "b", note: "Second" });
    expect(writes[1]).toEqual({ day: 1, slot: "lunch", position: 1, tripPlaceId: null });
  });

  it("a note write keeps the traveler flag unless it says otherwise", () => {
    let state = initialState(snapshot({ places: [card("a")], slots: [{ ...slot(1, "lunch", "a", "Book"), noteForTraveler: true }] }));
    state = reduce(state, { type: "slot", write: { day: 1, slot: "lunch", tripPlaceId: "a", note: "Book ahead" } });
    expect(state.slots[0]).toMatchObject({ note: "Book ahead", noteForTraveler: true });
    state = reduce(state, { type: "slot", write: { day: 1, slot: "lunch", tripPlaceId: "a", note: "Book ahead", noteForTraveler: false } });
    expect(state.slots[0].noteForTraveler).toBe(false);
  });
});

describe("url state", () => {
  it("reads and writes view, tab and place", () => {
    const params = new URLSearchParams(`view=map&tab=${ASK}&place=${ASK}&x=1`);
    const state = readUrlState(params);
    expect(state).toEqual({ view: "map", activeTab: `ask:${ASK}`, selectedPlaceId: ASK, camera: null });
    expect(writeUrlState("?x=1", { view: "itinerary", activeTab: "eat", selectedPlaceId: null })).toBe("?x=1&tab=eat");
    expect(readUrlState(new URLSearchParams("view=nope&tab=nope")).view).toBe("itinerary");
    expect(readUrlState(new URLSearchParams("view=board")).view).toBe("itinerary");
  });

  it("round-trips the map camera and drops a bad one", () => {
    const search = writeUrlState("", { view: "map", activeTab: "all", selectedPlaceId: null, camera: { lat: 38.712345678, lon: -9.1, zoom: 13.25 } });
    expect(search).toBe("?view=map&cam=38.71235%2C-9.1%2C13.25");
    expect(readUrlState(new URLSearchParams(search)).camera).toEqual({ lat: 38.71235, lon: -9.1, zoom: 13.25 });
    expect(readUrlState(new URLSearchParams("cam=91,0,3")).camera).toBeNull();
    expect(readUrlState(new URLSearchParams("cam=abc")).camera).toBeNull();
  });

  it("pushes view and place changes, replaces tab and camera changes", () => {
    const base = { view: "itinerary" as const, activeTab: "all" as const, selectedPlaceId: null, camera: null };
    expect(historyMode(base, { ...base, view: "map" })).toBe("pushState");
    expect(historyMode(base, { ...base, selectedPlaceId: ASK })).toBe("pushState");
    expect(historyMode(base, { ...base, activeTab: "eat" })).toBe("replaceState");
    expect(historyMode(base, { ...base, camera: { lat: 1, lon: 2, zoom: 3 } })).toBe("camera");
    expect(historyMode(base, { ...base })).toBeNull();
  });
});

describe("saved slots", () => {
  it("swaps temporary ids for the server's rows", () => {
    let state = initialState(snapshot({ places: [card("a")] }));
    state = reduce(state, { type: "slot", write: { day: 1, slot: "lunch", tripPlaceId: "a" } });
    state = reduce(state, { type: "slotsSaved", slots: [{ ...slot(1, "lunch", "a"), id: "real" }] });
    expect(state.slots.map((s) => s.id)).toEqual(["real"]);
  });
});

describe("agent notes", () => {
  const agentSlot: ItinerarySlot = {
    id: "s1",
    day: 1,
    slot: "dinner",
    position: 0,
    tripPlaceId: "tp1",
    note: "Book the 8 pm sitting",
    noteForTraveler: false,
    noteSource: "agent",
  };

  it("stay the agent's while the text is unchanged", () => {
    expect(writtenNoteSource({ note: "Book the 8 pm sitting" }, agentSlot)).toBe("agent");
    expect(writtenNoteSource({}, agentSlot)).toBe("agent");
  });

  it("become the advisor's once rewritten", () => {
    expect(writtenNoteSource({ note: "Book the 7 pm sitting" }, agentSlot)).toBe("advisor");
  });

  it("are never marked for the traveler on a write that keeps the text", () => {
    const [row] = applySlotWrites([agentSlot], [{ day: 1, slot: "dinner", tripPlaceId: "tp1", note: agentSlot.note, noteForTraveler: true }]);
    expect(row).toMatchObject({ noteSource: "agent", noteForTraveler: false });
  });

  it("move with the place on a swap", () => {
    const writes = swapWrites([agentSlot], { day: 1, slot: "dinner" }, { day: 1, slot: "lunch" });
    const rows = applySlotWrites([agentSlot], writes);
    expect(rows).toEqual([expect.objectContaining({ slot: "lunch", note: agentSlot.note, noteSource: "agent" })]);
  });
});
