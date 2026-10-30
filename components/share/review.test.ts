import { describe, expect, it } from "vitest";

import type { Ask, ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";
import { buildDays } from "@/components/trip/itinerary-view/itinerary-model";
import { initialState } from "@/components/trip/workspace/reducer";

import { notesTitle, privateDetail, shareReview } from "./review";

const ASK = "11111111-1111-4111-8111-111111111111";

function card(id: string, patch: Partial<TripPlaceCard> = {}): TripPlaceCard {
  return {
    tripPlaceId: id,
    placeId: `place-${id}`,
    entityId: `entity-${id}`,
    name: `Place ${id}`,
    category: "eat",
    because: [{ entityId: "E1", name: "Via Carota", share: 100 }],
    sharedTags: [],
    status: "suggested",
    source: "seed",
    askIds: [],
    imageUrl: `https://img/${id}.jpg`,
    ...patch,
  };
}

function slot(day: number, name: ItinerarySlot["slot"], tripPlaceId?: string, patch: Partial<ItinerarySlot> = {}): ItinerarySlot {
  return { id: `${day}-${name}`, day, slot: name, tripPlaceId, note: "", position: 0, ...patch };
}

function review(patch: Partial<TripSnapshot>) {
  const snapshot: TripSnapshot = {
    trip: {
      id: "trip",
      title: "Lisbon for Ana",
      clientId: "client",
      clientName: "Ana Ruiz",
      destination: { name: "Lisbon", lat: 38.7, lon: -9.1, radiusM: 8000 },
      startDate: "2027-05-14",
      endDate: "2027-05-15",
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
  const state = initialState(snapshot);
  return shareReview({ clientName: "Ana Ruiz", days: buildDays(state), slots: state.slots, places: state.places });
}

describe("shareReview", () => {
  it("uses the trip's cover over the first place photo", () => {
    const r = shareReview({ clientName: "Ana Ruiz", coverUrl: "https://img/cover.jpg", days: [], slots: [], places: {} });
    expect(r.cover).toBe("https://img/cover.jpg");
    expect(r.linkDetail).toBe("a cover photo and 0 places");
  });

  it("counts the places in the link and picks the first photo as the cover", () => {
    const r = review({
      places: [card("a"), card("b", { imageUrl: undefined }), card("c")],
      slots: [slot(1, "morning", "a"), slot(1, "lunch", "b"), slot(2, "lunch", "c")],
    });
    expect(r.placeCount).toBe(3);
    expect(r.cover).toBe("https://img/a.jpg");
    expect(r.thumbnails.map((t) => t.id)).toEqual(["a", "c"]);
    expect(r.linkDetail).toBe("a cover photo and 3 places");
    expect(r.reasons).toEqual({ complete: true, title: "Every place has a reason", detail: "3 of 3 match Ana's favorites" });
  });

  it("flags open slots with a suggested place", () => {
    const done: Ask = { id: ASK, label: "Late", status: "done", resultCount: 1, loosened: [], target: { day: 1, slot: "dinner" } };
    const r = review({ places: [card("r", { name: "Red Frog", askIds: [ASK] })], asks: [done] });
    expect(r.openSlots).toHaveLength(1);
    expect(r.openSlots[0]).toMatchObject({ title: "Friday dinner is still open", detail: "Red Frog is not added" });
  });

  it("lists advisor notes with their show flag and counts what stays private", () => {
    const r = review({
      places: [card("a", { name: "Sea Me", yourPlace: { advisorPlaceId: "p", note: "Owner is a friend" } }), card("b")],
      slots: [
        slot(1, "dinner", "a", { note: "Ask for a seat at the counter.", noteForTraveler: true }),
        slot(1, "lunch", "b", { note: "Book ahead" }),
        slot(1, "morning", undefined, { note: "Agent idea", noteSource: "agent" }),
      ],
    });
    expect(r.notes.map((n) => [n.label, n.shown])).toEqual([
      ["Place b", false],
      ["Sea Me", true],
    ]);
    // "Book ahead", the agent note and the saved place note.
    expect(r.privateCount).toBe(3);
    expect(notesTitle(r.client, r.notes)).toBe("Ana sees 1 note");
    expect(privateDetail(r.privateCount)).toBe("3 notes are not in the link");
  });

  it("says when a place has no reason", () => {
    const r = review({ places: [card("a", { because: [], sharedTags: [] })], slots: [slot(1, "lunch", "a")] });
    expect(r.reasons).toEqual({ complete: false, title: "1 place has no reason yet", detail: "0 of 1 match Ana's favorites" });
  });
});
