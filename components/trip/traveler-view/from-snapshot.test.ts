import { describe, expect, it } from "vitest";

import type { TripPlaceCard, TripSnapshot } from "@/lib/contracts";

import { travelerViewFromSnapshot } from "./from-snapshot";

const card = (overrides: Partial<TripPlaceCard>): TripPlaceCard => ({
  tripPlaceId: "tp-1",
  placeId: "p-1",
  entityId: "e-1",
  name: "Contramar",
  category: "eat",
  neighborhood: "Roma Norte",
  imageUrl: "https://images.qloo.com/i/contramar.jpg",
  score: 0.91,
  because: [{ entityId: "e-lilia", name: "Lilia", share: 100 }],
  sharedTags: [{ tagId: "t-1", name: "Seafood" }],
  yourPlace: { advisorPlaceId: "ap-1", note: "Ask for the corner table" },
  status: "added",
  source: "seed",
  askIds: ["ask-1"],
  ...overrides,
});

const snapshot: TripSnapshot = {
  trip: {
    id: "trip-1",
    title: "Mexico City for Marcus",
    clientId: "c-1",
    clientName: "Marcus Lee",
    destination: { name: "Mexico City", lat: 19.4, lon: -99.1, radiusM: 8000 },
    startDate: "2026-11-12",
    endDate: "2026-11-14",
    datesMode: "exact",
    stage: "planning",
    seedStatus: "done",
    chatId: "chat-1",
  },
  travelers: [],
  places: [card({}), card({ tripPlaceId: "tp-2", name: "Gone", status: "removed" })],
  asks: [],
  slots: [
    { id: "s-1", day: 1, slot: "lunch", tripPlaceId: "tp-1", note: "Private note", noteForTraveler: false, position: 0 },
    { id: "s-2", day: 1, slot: "dinner", tripPlaceId: "tp-2", note: "", position: 0 },
    { id: "s-3", day: 2, slot: "morning", note: "Sleep in, you earned it.", noteForTraveler: true, position: 0 },
  ],
};

describe("travelerViewFromSnapshot", () => {
  it("projects only what the traveler sees", () => {
    const view = travelerViewFromSnapshot(snapshot, "Daan");
    expect(view).toEqual({
      title: "Mexico City for Marcus",
      destinationName: "Mexico City",
      startDate: "2026-11-12",
      endDate: "2026-11-14",
      preparedFor: "Marcus",
      advisorName: "Daan",
      days: [
        {
          day: 1,
          date: "2026-11-12",
          slots: [
            {
              slot: "lunch",
              position: 0,
              place: {
                name: "Contramar",
                category: "eat",
                imageUrl: "https://images.qloo.com/i/contramar.jpg",
                neighborhood: "Roma Norte",
                because: [{ name: "Lilia", share: 100 }],
                sharedTags: ["Seafood"],
              },
            },
          ],
        },
        { day: 2, date: "2026-11-13", slots: [{ slot: "morning", position: 0, advisorNote: "Sleep in, you earned it." }] },
      ],
    });
    const text = JSON.stringify(view);
    expect(text).not.toContain("corner table");
    expect(text).not.toContain("Private note");
    expect(text).not.toContain("Gone");
    expect(text).not.toContain("0.91");
  });
});
