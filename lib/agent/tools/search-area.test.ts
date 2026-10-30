import { describe, expect, it } from "vitest";

import { distanceM } from "@/lib/map/geo";

import { chooseSearchArea, distanceLabel, middleOf, searchedAreaText, widenedNote, type PlacedPoint } from "./search-area";

const metro = { lat: 19.3819, lon: -99.1406, radiusM: 25_000 };
const town = { lat: 40.0, lon: 10.0, radiusM: 2_000 };

const contramar: PlacedPoint = { day: 1, slot: "lunch", name: "Contramar", lat: 19.4194, lon: -99.1695 };
const maximo: PlacedPoint = { day: 1, slot: "dinner", name: "Máximo", lat: 19.4177, lon: -99.1642 };
const rosetta: PlacedPoint = { day: 1, slot: "night", name: "Rosetta", lat: 19.4188, lon: -99.1602 };
const polanco: PlacedPoint = { day: 2, slot: "lunch", name: "Raíz", lat: 19.4325, lon: -99.1962 };
const hotel: PlacedPoint = { day: 2, slot: "stay", name: "La Valise", lat: 19.4216, lon: -99.1633 };

describe("chooseSearchArea", () => {
  it("starts at the city center with a walkable city radius, not the metro", () => {
    const area = chooseSearchArea({ destination: metro, placed: [] });
    expect(area).toMatchObject({ lat: metro.lat, lon: metro.lon, radiusM: 8_000 });
    expect(area.near).toBeUndefined();
    expect(area.widen).toEqual([{ radiusM: 25_000, below: 3 }]);
  });

  it("never searches past a small destination", () => {
    const area = chooseSearchArea({ destination: town, placed: [] });
    expect(area.radiusM).toBe(2_000);
    expect(area.widen).toEqual([]);
  });

  it("searches a day around the places already on it", () => {
    const area = chooseSearchArea({ destination: metro, placed: [contramar, maximo, rosetta, polanco], day: 1 });
    expect(area.lat).toBeCloseTo(19.4188, 4);
    expect(area.lon).toBeCloseTo(-99.1642, 4);
    expect(area.radiusM).toBe(2_500);
    expect(area.near).toBe("day 1's places");
    expect(area.widen).toEqual([{ radiusM: 5_000 }, { radiusM: 8_000 }, { radiusM: 25_000, below: 3 }]);
  });

  it("names the place when a day holds just one", () => {
    expect(chooseSearchArea({ destination: metro, placed: [contramar], day: 1 }).near).toBe("Contramar");
  });

  it("gives a spread out day more room, up to a limit", () => {
    const area = chooseSearchArea({ destination: metro, placed: [contramar, { ...polanco, day: 1 }], day: 1 });
    expect(area.radiusM).toBeGreaterThan(2_500);
    expect(area.radiusM).toBeLessThanOrEqual(5_000);
    const far = chooseSearchArea({ destination: metro, placed: [contramar, { ...polanco, day: 1, lat: 19.7, lon: -98.85 }], day: 1 });
    expect(far.radiusM).toBe(5_000);
  });

  it("falls back to the hotel on an empty day, the closest day's hotel if need be", () => {
    const area = chooseSearchArea({ destination: metro, placed: [contramar, hotel], day: 4 });
    expect(area).toMatchObject({ lat: hotel.lat, lon: hotel.lon, radiusM: 2_500, near: "La Valise" });
  });

  it("does not count the hotel as a place of the day", () => {
    expect(chooseSearchArea({ destination: metro, placed: [hotel, polanco], day: 2 }).near).toBe("Raíz");
  });

  it("uses the middle of the itinerary when no day is given", () => {
    const area = chooseSearchArea({ destination: metro, placed: [contramar, maximo] });
    expect(area.lat).toBeCloseTo((contramar.lat + maximo.lat) / 2, 6);
    expect(area.lon).toBeCloseTo((contramar.lon + maximo.lon) / 2, 6);
    expect(area).toMatchObject({ radiusM: 5_000, near: "your itinerary" });
  });

  it("uses the middle of the itinerary for an empty day with no hotel", () => {
    expect(chooseSearchArea({ destination: metro, placed: [contramar, maximo], day: 3 }).near).toBe("your itinerary");
  });

  it("a hotel search ignores the day and other hotels", () => {
    const area = chooseSearchArea({ destination: metro, placed: [contramar, hotel, polanco], day: 1, forStay: true });
    expect(area.near).toBe("your itinerary");
    expect(area.radiusM).toBe(5_000);
    expect(chooseSearchArea({ destination: metro, placed: [hotel], forStay: true }).near).toBeUndefined();
  });

  it("a named spot wins over the day and stays close", () => {
    const spot = { lat: 19.35, lon: -99.16, name: "Coyoacán" };
    const area = chooseSearchArea({ destination: metro, placed: [contramar], day: 1, spot });
    expect(area).toMatchObject({ lat: spot.lat, lon: spot.lon, radiusM: 1_500, near: "Coyoacán" });
    expect(area.widen).toEqual([{ radiusM: 3_000 }]);
  });

  it("the map region wins over everything and is searched as given", () => {
    const region = { lat: 1, lon: 2, radiusM: 900 };
    expect(chooseSearchArea({ destination: metro, placed: [contramar], day: 1, radiusM: 200, region })).toEqual({ ...region, widen: [] });
  });

  it("a radius from the advisor keeps the center and drops the wider circles", () => {
    const area = chooseSearchArea({ destination: metro, placed: [contramar, maximo, rosetta], day: 1, radiusM: 1_000 });
    expect(area.lon).toBeCloseTo(-99.1642, 4);
    expect(area).toMatchObject({ radiusM: 1_000, near: "day 1's places", widen: [] });
  });

  it("anywhere in the city searches the whole city, not around one place", () => {
    const area = chooseSearchArea({ destination: metro, placed: [contramar], day: 1, radiusM: 25_000 });
    expect(area).toEqual({ lat: metro.lat, lon: metro.lon, radiusM: 25_000, widen: [] });
  });

  it("keeps every result of a day inside what the old metro search reached", () => {
    const area = chooseSearchArea({ destination: metro, placed: [contramar, maximo, rosetta], day: 1 });
    for (const p of [contramar, maximo, rosetta]) expect(distanceM(area, p)).toBeLessThan(area.radiusM);
  });
});

describe("middleOf", () => {
  it("is the midpoint of two places", () => {
    expect(middleOf([{ lat: 0, lon: 0 }, { lat: 2, lon: 4 }])).toEqual({ lat: 1, lon: 2 });
  });

  it("is not dragged away by one far place", () => {
    const near = [{ lat: 1, lon: 1 }, { lat: 1.1, lon: 1.1 }, { lat: 1.2, lon: 1.2 }, { lat: 1.05, lon: 1.05 }];
    expect(middleOf([...near, { lat: 9, lon: 9 }])).toEqual({ lat: 1.1, lon: 1.1 });
  });
});

describe("area copy", () => {
  it("writes distances people can read", () => {
    expect(distanceLabel(800)).toBe("800 m");
    expect(distanceLabel(2_500)).toBe("2.5 km");
    expect(distanceLabel(8_000)).toBe("8 km");
  });

  it("says where the search looked", () => {
    expect(searchedAreaText({ near: "day 2's places" }, 2_500, "Lisbon")).toBe("within 2.5 km of day 2's places");
    expect(searchedAreaText({}, 8_000, "Lisbon")).toBe("within 8 km of the center of Lisbon");
  });

  it("speaks up only when the search left its first circle", () => {
    expect(widenedNote({ radiusM: 2_500 }, 2_500)).toBeUndefined();
    expect(widenedNote({ radiusM: 2_500 }, 5_000)).toBe("Few matches close by, so the search went out to 5 km.");
  });
});
