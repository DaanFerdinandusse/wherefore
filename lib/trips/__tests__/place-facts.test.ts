import { describe, expect, it } from "vitest";

import { cardDishes, cardKeywords, cardPriceLevel, placeFactsFromProperties, travelerFavorites } from "../map";

describe("cardKeywords", () => {
  it("keeps the top eight by count, most mentioned first", () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({ name: `k${i}`, count: i + 1 }));
    const out = cardKeywords(raw);
    expect(out).toHaveLength(8);
    expect(out[0]).toEqual({ name: "k9", count: 10 });
    expect(out[7]).toEqual({ name: "k2", count: 3 });
  });

  it("drops malformed entries and zero counts, merges repeats by name", () => {
    const raw = [
      { name: "Oysters", count: 12 },
      { name: "oysters", count: 30 },
      { name: "", count: 4 },
      { name: "service", count: 0 },
      { count: 9 },
      "pour-over",
      null,
    ];
    expect(cardKeywords(raw)).toEqual([{ name: "oysters", count: 30 }]);
  });

  it("reads nothing from a non-array", () => {
    expect(cardKeywords(undefined)).toEqual([]);
    expect(cardKeywords({ name: "x", count: 1 })).toEqual([]);
  });
});

describe("cardDishes", () => {
  it("reads tag objects heaviest first, keeps the provider's order on ties", () => {
    const raw = [
      { id: "a", name: "And Taco", weight: 1 },
      { id: "b", name: "Scarlet Shrimp", weight: 0.75 },
      { id: "c", name: "Fresh Shrimp With Mushroom Rice", weight: 0.75 },
    ];
    expect(cardDishes(raw)).toEqual(["And Taco", "Scarlet Shrimp", "Fresh Shrimp With Mushroom Rice"]);
  });

  it("accepts plain strings, skips repeats and blanks, caps the list", () => {
    expect(cardDishes(["Pastel de nata", "pastel de nata", " ", "Bifana", "Prego", "Caldo verde", "Ameijoas"])).toEqual([
      "Pastel de nata",
      "Bifana",
      "Prego",
      "Caldo verde",
    ]);
  });
});

describe("cardPriceLevel", () => {
  it("accepts 1 to 4 only", () => {
    expect(cardPriceLevel(3)).toBe(3);
    expect(cardPriceLevel(0)).toBeUndefined();
    expect(cardPriceLevel(5)).toBeUndefined();
    expect(cardPriceLevel(2.5)).toBeUndefined();
    expect(cardPriceLevel(null)).toBeUndefined();
  });
});

describe("travelerFavorites", () => {
  it("keeps named favorites and leaves null ids and images out", () => {
    expect(
      travelerFavorites([
        { name: "Via Carota", entityId: "E1", imageUrl: "https://img/1.jpg" },
        { name: "Mel's", entityId: null, imageUrl: null },
        { name: "", entityId: "E3" },
      ]),
    ).toEqual([{ name: "Via Carota", entityId: "E1", imageUrl: "https://img/1.jpg" }, { name: "Mel's" }]);
    expect(travelerFavorites(null)).toEqual([]);
  });
});

describe("placeFactsFromProperties", () => {
  it("leaves empty fields out", () => {
    expect(placeFactsFromProperties({})).toEqual({});
    expect(placeFactsFromProperties(null)).toEqual({});
    expect(placeFactsFromProperties({ keywords: [{ name: "wine", count: 3 }] })).toEqual({
      keywords: [{ name: "wine", count: 3 }],
    });
  });
});
