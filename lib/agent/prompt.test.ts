import { describe, expect, it } from "vitest";

import type { TripContextOutput } from "@/lib/contracts";

import { buildInstructions, renderTripHeader, tripDayList } from "./prompt";
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

describe("tripDayList", () => {
  const trip = (startDate?: string, endDate?: string, datesMode = "exact") =>
    ({ startDate, endDate, datesMode }) as unknown as TripContextOutput["trip"];

  it("lists one line per trip day", () => {
    expect(tripDayList(trip("2027-05-14", "2027-05-16"))).toEqual([
      "day 1 Fri 2027-05-14",
      "day 2 Sat 2027-05-15",
      "day 3 Sun 2027-05-16",
    ]);
  });

  it("crosses a month and stops at 60 days", () => {
    expect(tripDayList(trip("2027-05-31", "2027-06-01"))).toEqual(["day 1 Mon 2027-05-31", "day 2 Tue 2027-06-01"]);
    expect(tripDayList(trip("2027-01-01", "2027-12-31"))).toHaveLength(60);
  });

  it("has no list without exact dates, or with the end before the start", () => {
    expect(tripDayList(trip("2027-05-14", "2027-05-16", "unset"))).toBeUndefined();
    expect(tripDayList(trip("2027-05-14"))).toBeUndefined();
    expect(tripDayList(trip("2027-05-16", "2027-05-14"))).toBeUndefined();
  });
});

describe("search options in the instructions", () => {
  const text = buildInstructions(undefined, { today: new Date("2027-01-01") });

  it("keeps Michelin to the advisor's ask and never reads it as stars", () => {
    expect(text).toContain("michelin on find_places only when the advisor asks");
    expect(text).toContain("does not tell you it has stars");
  });

  it("asks for a less known pick when planning several slots", () => {
    expect(text).toContain("at least one pick should be less known");
  });
});
