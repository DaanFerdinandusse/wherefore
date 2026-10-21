import { describe, expect, it } from "vitest";

import { foldTripPlaces, mergeTripPlace } from "../merge";
import { computeStage, daysBetween, tripDayCount } from "../stage";

const trip = { stageOverride: null, shareToken: null, startDate: "2026-05-14", endDate: "2026-05-18" };

describe("computeStage", () => {
  it("is planning before the dates without a share link", () => {
    expect(computeStage(trip, "2026-05-01")).toBe("planning");
    expect(computeStage({ ...trip, startDate: null, endDate: null }, "2026-05-01")).toBe("planning");
  });

  it("is shared once a token exists", () => {
    expect(computeStage({ ...trip, shareToken: "abc" }, "2026-05-01")).toBe("shared");
  });

  it("is traveling within the dates, inclusive", () => {
    expect(computeStage(trip, "2026-05-14")).toBe("traveling");
    expect(computeStage({ ...trip, shareToken: "abc" }, "2026-05-18")).toBe("traveling");
  });

  it("is done after the end date", () => {
    expect(computeStage(trip, "2026-05-19")).toBe("done");
  });

  it("lets a manual override win and ignores unknown values", () => {
    expect(computeStage({ ...trip, stageOverride: "shared" }, "2026-05-19")).toBe("shared");
    expect(computeStage({ ...trip, stageOverride: "archived" }, "2026-05-19")).toBe("done");
  });
});

describe("tripDayCount", () => {
  it("counts days inclusively from the dates", () => {
    expect(daysBetween("2026-05-14", "2026-05-18")).toBe(5);
    expect(tripDayCount(trip)).toBe(5);
  });

  it("starts an undated trip with three days and grows with its slots", () => {
    expect(tripDayCount({ startDate: null, endDate: null })).toBe(3);
    expect(tripDayCount({ startDate: null, endDate: null }, 5)).toBe(5);
  });
});

describe("mergeTripPlace", () => {
  const seed = { placeId: "p", source: "seed" as const, category: "other" as const, bestScore: 70 };

  it("keeps the stronger source and the better score set", () => {
    const merged = mergeTripPlace(seed, { ...seed, source: "ask", category: "eat", bestScore: 60 });
    expect(merged).toMatchObject({ source: "ask", category: "eat", bestScore: 70 });
    expect(mergeTripPlace(merged, { ...seed, bestScore: 90 })).toMatchObject({ source: "ask", bestScore: 90 });
  });

  it("folds duplicates in input order", () => {
    expect(foldTripPlaces([seed, { ...seed, source: "manual" }, { ...seed, placeId: "q" }])).toHaveLength(2);
  });
});
