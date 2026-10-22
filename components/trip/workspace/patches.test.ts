import { describe, expect, it } from "vitest";

import type { ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";

import { applyOptimistic, applyRemote, commitPatch, revertPatch, type Patch } from "./patches";
import { initialState, type WorkspaceEvent, type WorkspaceState } from "./reducer";

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

const row = (day: number, name: ItinerarySlot["slot"], tripPlaceId?: string, note = ""): ItinerarySlot => ({
  id: `slot-${day}-${name}`,
  day,
  slot: name,
  tripPlaceId,
  note,
  noteForTraveler: false,
  position: 0,
});

function snapshot(patch: Partial<TripSnapshot> = {}): TripSnapshot {
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
    },
    travelers: [],
    places: [card("a"), card("b"), card("c")],
    asks: [],
    slots: [],
    ...patch,
  };
}

/** A tiny store: the state plus the patches in flight, as store.ts keeps them. */
function harness(initial: WorkspaceState) {
  let state = initial;
  let pending: Patch[] = [];
  return {
    get state() {
      return state;
    },
    optimistic(events: WorkspaceEvent[]) {
      const result = applyOptimistic(state, events);
      state = result.state;
      pending = [...pending, result.patch];
      const patch = result.patch;
      return {
        rollback() {
          const reverted = revertPatch(state, patch, pending);
          state = reverted.state;
          pending = reverted.pending;
        },
        commit() {
          pending = commitPatch(pending, patch);
        },
      };
    },
    remote(event: WorkspaceEvent) {
      state = applyRemote(state, event);
    },
  };
}

const add = (day: number, slot: ItinerarySlot["slot"], tripPlaceId: string | null, note?: string): WorkspaceEvent => ({
  type: "slot",
  write: { day, slot, tripPlaceId, ...(note !== undefined ? { note } : {}) },
});

describe("inverse patches", () => {
  it("a rollback reverts only what that write changed", () => {
    const h = harness(initialState(snapshot()));
    const lunch = h.optimistic([add(1, "lunch", "a")]);
    // Unrelated changes while the write is in flight: another slot, a streamed place, a new ask.
    h.optimistic([add(2, "dinner", "b")]).commit();
    h.remote({ type: "places", places: [card("d", { category: "drink" })], meta: { askId: ASK, toolCallId: "t", phase: "done", label: "Wine" } });
    lunch.rollback();
    expect(h.state.slots.map((s) => [s.day, s.slot, s.tripPlaceId])).toEqual([[2, "dinner", "b"]]);
    expect(h.state.places.a.status).toBe("suggested");
    expect(h.state.places.b.status).toBe("added");
    expect(h.state.places.d).toBeDefined();
    expect(h.state.asks[ASK]).toBeDefined();
  });

  it("a rollback never undoes a later successful write to the same slot", () => {
    const h = harness(initialState(snapshot()));
    const first = h.optimistic([add(1, "lunch", "a")]);
    const second = h.optimistic([add(1, "lunch", "b")]);
    second.commit();
    first.rollback();
    expect(h.state.slots.map((s) => s.tripPlaceId)).toEqual(["b"]);
    expect(h.state.places.b.status).toBe("added");
  });

  it("a later write still in flight inherits the state before an earlier failed one", () => {
    const h = harness(initialState(snapshot({ slots: [row(1, "lunch", "c", "Keep")] })));
    const first = h.optimistic([add(1, "lunch", "a")]);
    const second = h.optimistic([add(1, "lunch", "b")]);
    first.rollback();
    // The second write still shows; when it fails too, the slot goes back to before both.
    expect(h.state.slots[0].tripPlaceId).toBe("b");
    second.rollback();
    expect(h.state.slots.map((s) => [s.tripPlaceId, s.note])).toEqual([["c", "Keep"]]);
    expect(h.state.places.c.status).toBe("added");
    expect(h.state.places.a.status).toBe("suggested");
  });

  it("rolling back the later write first lands on the earlier write, then on the start", () => {
    const h = harness(initialState(snapshot()));
    const first = h.optimistic([add(1, "lunch", "a")]);
    const second = h.optimistic([{ type: "status", tripPlaceId: "a", status: "removed" }]);
    second.rollback();
    expect(h.state.slots[0].tripPlaceId).toBe("a");
    expect(h.state.places.a.status).toBe("added");
    first.rollback();
    expect(h.state.slots).toEqual([]);
    expect(h.state.places.a.status).toBe("suggested");
  });

  it("a server answer for the slot wins over an older rollback", () => {
    const h = harness(initialState(snapshot()));
    const write = h.optimistic([add(1, "lunch", "a")]);
    h.remote({ type: "slotsSaved", slots: [{ ...row(1, "lunch", "c"), id: "real" }] });
    write.rollback();
    expect(h.state.slots.map((s) => [s.id, s.tripPlaceId])).toEqual([["real", "c"]]);
  });

  it("a snapshot is canonical: nothing from before it rolls back", () => {
    const h = harness(initialState(snapshot()));
    const write = h.optimistic([add(1, "lunch", "a")]);
    h.remote({ type: "snapshot", snapshot: snapshot({ slots: [row(1, "lunch", "a")] }) });
    write.rollback();
    expect(h.state.slots.map((s) => s.tripPlaceId)).toEqual(["a"]);
  });

  it("archiving an ask rolls back its tab and memberships, not a newer ask", () => {
    const OTHER = "22222222-2222-4222-8222-222222222222";
    const h = harness(
      initialState(
        snapshot({
          places: [card("a", { askIds: [ASK] })],
          asks: [{ id: ASK, label: "Wine", status: "done", resultCount: 1, loosened: [] }],
        }),
        { activeTab: `ask:${ASK}` },
      ),
    );
    const archive = h.optimistic([{ type: "archiveAsk", askId: ASK }]);
    expect(h.state.activeTab).toBe("all");
    h.remote({ type: "places", places: [card("b")], meta: { askId: OTHER, toolCallId: "t2", phase: "searching", label: "Coffee" } });
    archive.rollback();
    expect(h.state.asks[ASK].status).toBe("done");
    expect(h.state.places.a.askIds).toEqual([ASK]);
    // The newer ask opened its own tab since; the rollback leaves it there.
    expect(h.state.activeTab).toBe(`ask:${OTHER}`);
    expect(h.state.asks[OTHER].status).toBe("running");
  });

  it("removing a place rolls back its slot and status together", () => {
    const h = harness(initialState(snapshot({ slots: [row(1, "dinner", "a", "Book")] })));
    const remove = h.optimistic([{ type: "status", tripPlaceId: "a", status: "removed" }]);
    expect(h.state.slots[0].tripPlaceId).toBeUndefined();
    remove.rollback();
    expect(h.state.slots[0]).toMatchObject({ tripPlaceId: "a", note: "Book" });
    expect(h.state.places.a.status).toBe("added");
  });
});
