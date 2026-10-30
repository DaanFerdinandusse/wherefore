import { describe, expect, it } from "vitest";

import type { FavoriteWithPlace } from "@/lib/clients/contracts";

import { matchedCount, moveItem, removeById, toFavoriteTile, upsertById } from "./favorites";

function favorite(overrides: Partial<FavoriteWithPlace>): FavoriteWithPlace {
  return {
    id: "f1",
    clientId: "c1",
    query: "via carota",
    entityId: null,
    placeId: null,
    match: "unmatched",
    candidates: [],
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    place: null,
    ...overrides,
  };
}

describe("toFavoriteTile", () => {
  it("shows the matched place's name, city and image", () => {
    const tile = toFavoriteTile(
      favorite({
        match: "resolved",
        entityId: "E1",
        place: { id: "p1", entityId: "E1", name: "Via Carota", city: "New York", imageUrl: "https://images.qloo.com/a.jpg", primaryType: "urn:tag:genre:place:restaurant" },
      }),
    );
    expect(tile).toMatchObject({ name: "Via Carota", city: "New York", imageUrl: "https://images.qloo.com/a.jpg", match: "resolved" });
  });

  it("falls back to what was typed and treats unknown matches as unmatched", () => {
    const tile = toFavoriteTile(favorite({ query: "Mel's", match: "something" }));
    expect(tile).toMatchObject({ name: "Mel's", city: null, imageUrl: null, match: "unmatched" });
  });
});

describe("list moves", () => {
  it("moves an item and clamps the target", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("replaces an optimistic row by its temporary id, or appends", () => {
    const list = [{ id: "tmp", v: 1 }];
    expect(upsertById(list, { id: "real", v: 2 }, "tmp")).toEqual([{ id: "real", v: 2 }]);
    expect(upsertById(list, { id: "other", v: 3 })).toEqual([{ id: "tmp", v: 1 }, { id: "other", v: 3 }]);
    expect(removeById(list, "tmp")).toEqual([]);
  });

  it("counts matched favorites only", () => {
    expect(matchedCount([{ match: "resolved" }, { match: "unmatched" }, { match: "resolved" }])).toBe(2);
  });
});
