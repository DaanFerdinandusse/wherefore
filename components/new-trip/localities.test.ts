import { describe, expect, it } from "vitest";

import { orderLocalityCandidates, placesInCity, storedDestination, toDestination } from "./localities";

const candidate = (name: string, disambiguation: string, entityId = name) => ({
  entityId,
  name,
  disambiguation,
  lat: 0,
  lon: 0,
  radiusM: 10000,
});

describe("orderLocalityCandidates", () => {
  it("puts the city before the state of the same name and keeps everything", () => {
    const ordered = orderLocalityCandidates([
      candidate("New York", "State, United States", "state"),
      candidate("New York", "City, United States", "city"),
      candidate("Newark", "City, United States", "newark"),
    ]);
    expect(ordered.map((c) => c.entityId)).toEqual(["city", "state", "newark"]);
  });

  it("matches names regardless of accents and case when grouping", () => {
    const ordered = orderLocalityCandidates([
      candidate("Oaxaca", "State, Mexico", "state"),
      candidate("Lisboa", "City, Portugal", "lisboa"),
      candidate("oaxaca", "Municipality, Oaxaca, Mexico", "city"),
    ]);
    expect(ordered.map((c) => c.entityId)).toEqual(["city", "state", "lisboa"]);
  });

  it("keeps the provider order otherwise", () => {
    const list = [candidate("Lisboa", "City, Portugal"), candidate("Lisbon", "Town, Maine")];
    expect(orderLocalityCandidates(list)).toEqual(list);
  });
});

describe("placesInCity", () => {
  const cities = [
    { city: "Lisboa", count: 11 },
    { city: "Ciudad de México", count: 4 },
  ];
  it("reads the advisor's count by city name", () => {
    expect(placesInCity(cities, "Lisboa")).toBe(11);
    expect(placesInCity(cities, "ciudad de mexico")).toBe(4);
    expect(placesInCity(cities, "Porto")).toBe(0);
  });
});

describe("toDestination", () => {
  it("stores exactly the name the picker returned", () => {
    expect(toDestination({ ...candidate("Lisboa", "City, Portugal", "e1"), countryCode: "PT" })).toEqual({
      name: "Lisboa",
      disambiguation: "City, Portugal",
      countryCode: "PT",
      lat: 0,
      lon: 0,
      radiusM: 10000,
      localityEntityId: "e1",
    });
  });
});

describe("storedDestination", () => {
  it("drops the past trip fields", () => {
    const stored = storedDestination({
      name: "Oaxaca",
      countryCode: "MX",
      lat: 17.06,
      lon: -96.72,
      radiusM: 12000,
      lastTripId: "t1",
      lastStartDate: "2026-03-06",
      tripCount: 2,
    });
    expect(stored).toMatchObject({ name: "Oaxaca", countryCode: "MX", lat: 17.06, lon: -96.72, radiusM: 12000 });
    expect(stored).not.toHaveProperty("lastTripId");
    expect(stored).not.toHaveProperty("tripCount");
  });
});
