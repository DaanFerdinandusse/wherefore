import { describe, expect, it } from "vitest";

import { board, tripCard } from "./fixtures";
import { DEFAULT_SORT, nextSort, sortTrips } from "./sort";

const cards = [
  tripCard({ id: "a", clientName: "Marcus Lee", destination: { name: "Tokyo", lat: 0, lon: 0, radiusM: 1 }, startDate: "2026-12-03" }),
  tripCard({ id: "b", clientName: "ana ruiz", destination: { name: "Mexico City", lat: 0, lon: 0, radiusM: 1 }, startDate: null, endDate: null }),
  tripCard({ id: "c", clientName: "Priya Shah", stage: "traveling", startDate: "2026-11-09" }),
  tripCard({ id: "d", clientName: "Elena Costa", stage: "done", destination: { name: "Paris", lat: 0, lon: 0, radiusM: 1 }, startDate: "2026-09-14" }),
];
const grouped = board(cards);
const ids = (sorted: { id: string }[]) => sorted.map((c) => c.id);

describe("sortTrips", () => {
  it("defaults to the board's stage order, then departure", () => {
    expect(ids(sortTrips(grouped, DEFAULT_SORT))).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts by departure both ways and keeps trips without dates last", () => {
    expect(ids(sortTrips(grouped, { key: "date", direction: "asc" }))).toEqual(["d", "c", "a", "b"]);
    expect(ids(sortTrips(grouped, { key: "date", direction: "desc" }))).toEqual(["a", "c", "d", "b"]);
  });

  it("sorts by city and by client, ignoring case", () => {
    expect(ids(sortTrips(grouped, { key: "city", direction: "asc" }))).toEqual(["c", "b", "d", "a"]);
    expect(ids(sortTrips(grouped, { key: "client", direction: "desc" }))).toEqual(["c", "a", "d", "b"]);
  });
});

describe("nextSort", () => {
  it("flips the same column and starts another ascending", () => {
    expect(nextSort({ key: "date", direction: "asc" }, "date")).toEqual({ key: "date", direction: "desc" });
    expect(nextSort({ key: "date", direction: "desc" }, "city")).toEqual({ key: "city", direction: "asc" });
  });
});
