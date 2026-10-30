import { describe, expect, it } from "vitest";

import { addPosition, appendPositions, isOpenSlot, nextPosition, overflowSlot, slotHolds, slotRule } from "./day-parts";

const row = (slot: "lunch" | "afternoon", position: number, tripPlaceId?: string, note = "") => ({
  day: 1,
  slot,
  position,
  tripPlaceId,
  note,
});

describe("day parts", () => {
  it("tells a meal from an open slot", () => {
    expect(isOpenSlot("lunch")).toBe(false);
    expect(isOpenSlot("afternoon")).toBe(true);
    expect(isOpenSlot("stay")).toBe(false);
  });

  it("adds after what an open slot holds and reuses an empty row", () => {
    expect(nextPosition([], 1, "afternoon")).toBe(0);
    expect(nextPosition([row("afternoon", 0, "a"), row("afternoon", 2, "b")], 1, "afternoon")).toBe(3);
    expect(nextPosition([row("afternoon", 0, "a"), row("afternoon", 1)], 1, "afternoon")).toBe(1);
    expect(nextPosition([row("afternoon", 0, undefined, "Keep this free")], 1, "afternoon")).toBe(1);
  });

  it("a meal always lands on its one place", () => {
    expect(addPosition([row("lunch", 0, "a")], { day: 1, slot: "lunch" })).toBe(0);
    expect(addPosition([row("afternoon", 0, "a")], { day: 1, slot: "afternoon" })).toBe(1);
    expect(addPosition([row("afternoon", 0, "a")], { day: 2, slot: "afternoon" })).toBe(0);
  });

  it("keeps restaurants in meals, sights and bars out of them, and hotels in the stay", () => {
    for (const slot of ["breakfast", "lunch", "dinner"] as const) {
      expect(slotHolds(slot, "eat")).toBe(true);
      expect(slotHolds(slot, "coffee")).toBe(true);
      expect(slotHolds(slot, "see")).toBe(false);
      expect(slotHolds(slot, "drink")).toBe(false);
      expect(slotHolds(slot, "other")).toBe(false);
      expect(slotHolds(slot, "stay")).toBe(false);
    }
    for (const slot of ["morning", "afternoon", "night"] as const) {
      expect(slotHolds(slot, "eat")).toBe(false);
      expect(slotHolds(slot, "coffee")).toBe(true);
      expect(slotHolds(slot, "see")).toBe(true);
      expect(slotHolds(slot, "drink")).toBe(true);
      expect(slotHolds(slot, "other")).toBe(true);
      expect(slotHolds(slot, "stay")).toBe(false);
    }
    expect(slotHolds("stay", "stay")).toBe(true);
    expect(slotHolds("stay", "eat")).toBe(false);
    expect(slotRule("eat")).toBe("Restaurants go in breakfast, lunch or dinner.");
  });

  it("overflows into an open slot only for a place that may go there", () => {
    expect(overflowSlot("eat")).toBeNull();
    expect(overflowSlot("drink")).toBe("night");
    expect(overflowSlot("see")).toBe("morning");
    expect(overflowSlot("stay")).toBeNull();
  });
});

describe("appendPositions", () => {
  const stored = [row("afternoon", 0, "museum")];

  it("appends to an open slot without touching what is there", () => {
    const asked = [
      { day: 1, slot: "afternoon" as const, tripPlaceId: "gallery" },
      { day: 1, slot: "afternoon" as const, tripPlaceId: "park" },
    ];
    expect(appendPositions(asked, stored)).toEqual([1, 2]);
  });

  it("gives a retry the same rows", () => {
    const asked = [{ day: 1, slot: "afternoon" as const, tripPlaceId: "gallery" }];
    const [position] = appendPositions(asked, stored);
    expect(appendPositions(asked, [...stored, row("afternoon", position, "gallery")])).toEqual([position]);
  });

  it("keeps a meal on position 0, and repeats in one write on the next", () => {
    const lunch = { day: 1, slot: "lunch" as const };
    expect(appendPositions([{ ...lunch, tripPlaceId: "b" }], [row("lunch", 0, "a")])).toEqual([0]);
    expect(appendPositions([{ ...lunch, tripPlaceId: "a" }, { ...lunch, tripPlaceId: "b" }], [])).toEqual([0, 1]);
  });
});
