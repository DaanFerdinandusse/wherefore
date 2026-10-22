import { describe, expect, it } from "vitest";

import { addDays, nameMatches, nameTokens, pickLocality, tripDates } from "./rules";

describe("nameMatches", () => {
  it.each([
    ["Monmouth Coffee", "Monmouth Coffee Company"],
    ["Máximo Bistrot", "Máximo"],
    ["Cervejaria Ramiro", "Restaurant - Cervejaria Ramiro"],
    ["The Barn", "THE BARN Café Mitte"],
    ["Le Châteaubriand", "Le Chateaubriand"],
    ["Alcôa", "Alcôa"],
    ["St. John", "St. John"],
  ])("%s finds %s", (query, hit) => {
    expect(nameMatches(query, hit)).toBe(true);
  });

  it.each([
    ["Pastelaria Alcôa", "Pastelaria Careca"],
    ["Lilia", "Lilian and Jane Boutique Spa"],
    ["Via Carota", "Via 13"],
    ["Mel's", "Melt"],
  ])("%s does not find %s", (query, hit) => {
    expect(nameMatches(query, hit)).toBe(false);
  });

  it("drops accents and apostrophes", () => {
    expect(nameTokens("Mel's Café")).toEqual(["mels", "cafe"]);
  });
});

describe("pickLocality", () => {
  const candidates = [
    { name: "New York", disambiguation: "New York, United States of America" },
    { name: "New York", disambiguation: "New York, New York, United States of America" },
  ];

  it("keeps the candidate the spec names", () => {
    expect(pickLocality({ query: "New York", disambiguationStartsWith: "New York, New York" }, candidates)).toBe(
      candidates[1],
    );
  });

  it("falls back to the first candidate", () => {
    expect(pickLocality({ query: "New York" }, candidates)).toBe(candidates[0]);
    expect(pickLocality({ query: "x", disambiguationStartsWith: "Nowhere" }, candidates)).toBe(candidates[0]);
  });
});

describe("tripDates", () => {
  const today = "2026-10-21";

  it("keeps fixed dates", () => {
    expect(tripDates({ kind: "fixed", start: "2027-05-14", end: "2027-05-18" }, today)).toEqual({
      start: "2027-05-14",
      end: "2027-05-18",
    });
  });

  it("puts next-month trips in next month, across a year end", () => {
    expect(tripDates({ kind: "next-month", startDay: 12, nights: 4 }, today)).toEqual({
      start: "2026-11-12",
      end: "2026-11-16",
    });
    expect(tripDates({ kind: "next-month", startDay: 12, nights: 4 }, "2026-12-30")).toEqual({
      start: "2027-01-12",
      end: "2027-01-16",
    });
  });

  it("spans today for a trip in progress", () => {
    expect(tripDates({ kind: "around-today", daysBefore: 1, daysAfter: 3 }, today)).toEqual({
      start: "2026-10-20",
      end: "2026-10-24",
    });
  });

  it("goes one year back for a past trip", () => {
    expect(tripDates({ kind: "last-year", month: 3, day: 6, nights: 4 }, today)).toEqual({
      start: "2025-03-06",
      end: "2025-03-10",
    });
  });

  it("adds days across a month end", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});
