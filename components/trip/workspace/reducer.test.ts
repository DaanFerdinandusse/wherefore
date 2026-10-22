import { describe, expect, it } from "vitest";

import type { ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";

import {
  activeAskPlaceIds,
  dayCount,
  initialState,
  liveAsks,
  moveWrites,
  nextFreeSlot,
  reduce,
  tabCounts,
  visiblePlaces,
  type WorkspaceState,
} from "./reducer";
import { readUrlState, writeUrlState } from "./url-state";

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
    let state = initialState(snapshot({ places: [card("a"), card("c", { category: "see" })] }));
    state = reduce(state, { type: "places", places: [card("b")], meta: { askId: ASK, toolCallId: "t", phase: "searching" } });
    expect(state.activeTab).toBe(`ask:${ASK}`);
    expect(visiblePlaces(state).map((p) => p.tripPlaceId)).toEqual(["b"]);
    expect(activeAskPlaceIds(state)).toEqual(["b"]);
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
  });

  it("finds the next free slot that suits the category", () => {
    const state = initialState(snapshot({ places: [card("a")], slots: [slot(1, "lunch", "a"), slot(1, "dinner", "a")] }));
    expect(nextFreeSlot(state, "eat")).toEqual({ day: 2, slot: "lunch" });
    expect(nextFreeSlot(state, "coffee")).toEqual({ day: 1, slot: "morning" });
    const full: WorkspaceState = { ...state, slots: [1, 2, 3, 4].map((d) => slot(d, "stay", "a")) };
    expect(nextFreeSlot(full, "stay")).toBeNull();
  });

  it("moves a place within a day by swapping with the target slot", () => {
    const slots = [slot(1, "morning", "a", "Early"), slot(1, "afternoon", "b")];
    expect(moveWrites(slots, { day: 1, slot: "morning" }, { day: 1, slot: "afternoon" })).toEqual([
      { day: 1, slot: "afternoon", tripPlaceId: "a", note: "Early" },
      { day: 1, slot: "morning", tripPlaceId: "b", note: "" },
    ]);
    expect(moveWrites(slots, { day: 1, slot: "morning" }, { day: 1, slot: "night" })[1]).toMatchObject({ tripPlaceId: null });
  });
});

describe("url state", () => {
  it("reads and writes view, tab and place", () => {
    const params = new URLSearchParams(`view=map&tab=${ASK}&place=${ASK}&x=1`);
    const state = readUrlState(params);
    expect(state).toEqual({ view: "map", activeTab: `ask:${ASK}`, selectedPlaceId: ASK });
    expect(writeUrlState("?x=1", { view: "board", activeTab: "eat", selectedPlaceId: null })).toBe("?x=1&tab=eat");
    expect(readUrlState(new URLSearchParams("view=nope&tab=nope")).view).toBe("board");
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
