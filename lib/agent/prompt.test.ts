import { describe, expect, it } from "vitest";

import type { TripContextOutput } from "@/lib/contracts";

import { renderTripHeader } from "./prompt";
import { fitContext } from "./trip-context";

const context = {
  trip: {
    title: "Lisbon",
    clientName: "Ana Ruiz",
    destination: { name: "Lisbon", disambiguation: "Portugal" },
    datesMode: "unset",
  },
  party: { adults: 1, children: 0 },
  travelers: [
    {
      name: "Ana Ruiz",
      role: "client",
      favorites: ["Via Carota"],
      media: ["Khruangbin (artist)", "In the Mood for Love (film)"],
      tasteTags: [],
      rules: [],
    },
    { name: "Clara", role: "guest", favorites: [], media: [], tasteTags: [], rules: [] },
  ],
  advisorPlaces: [],
  board: { categories: [], asks: [] },
  itinerary: [],
} as unknown as TripContextOutput;

describe("the trip header", () => {
  it("tells the agent about artists and films", () => {
    const header = renderTripHeader(context);
    expect(header).toContain('"media_favorites":["Khruangbin (artist)","In the Mood for Love (film)"]');
    expect(header.match(/media_favorites/g)).toHaveLength(1);
  });
});

describe("fitContext", () => {
  it("trims artists and films like the other lists", () => {
    const long = structuredClone(context);
    long.travelers[0]!.media = Array.from({ length: 8 }, (_, i) => `Artist ${i} (artist)`);
    long.itinerary = [];
    const fitted = fitContext(long, JSON.stringify(long).length - 30);
    expect(fitted.travelers[0]!.media!.length).toBeLessThan(8);
  });
});
