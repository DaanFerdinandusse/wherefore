import { describe, expect, it } from "vitest";

import {
  askFiltersOfQuery,
  cardDishes,
  cardKeywords,
  cardMichelin,
  cardPopularity,
  cardPriceLevel,
  placeFactsFromProperties,
  travelerFavorites,
} from "../map";

describe("cardPopularity", () => {
  it("keeps a 0 to 1 percentile and nothing else", () => {
    expect(cardPopularity(0.02)).toBe(0.02);
    expect(cardPopularity(0)).toBe(0);
    expect(cardPopularity(1.5)).toBeUndefined();
    expect(cardPopularity("0.4")).toBeUndefined();
    expect(cardPopularity(null)).toBeUndefined();
  });
});

describe("cardMichelin", () => {
  it("reads both shapes the provider sends", () => {
    // /v2/insights: a list with stars that are often null.
    expect(cardMichelin({ michelin: [{ id: "118394", stars: null }] })).toBe(true);
    expect(cardMichelin({ michelin: [{ id: "357840", stars: 2 }] })).toBe(true);
    // /search and /entities: one object.
    expect(cardMichelin({ michelin: { id: "118394" } })).toBe(true);
  });

  it("shows nothing unless the key is really there", () => {
    expect(cardMichelin(undefined)).toBe(false);
    expect(cardMichelin({})).toBe(false);
    expect(cardMichelin({ michelin: null })).toBe(false);
    expect(cardMichelin({ michelin: [] })).toBe(false);
    expect(cardMichelin({ michelin: {} })).toBe(false);
    expect(cardMichelin({ michelin: [{ stars: 1 }] })).toBe(false);
    expect(cardMichelin({ google_place: [{ id: "x" }] })).toBe(false);
  });
});

describe("placeFactsFromProperties", () => {
  it("adds popularity and michelin when the block has them", () => {
    expect(placeFactsFromProperties({ popularity: 0.02, external: { michelin: [{ id: "1", stars: null }] } })).toEqual({
      popularity: 0.02,
      michelin: true,
    });
  });

  it("leaves them out when unknown", () => {
    expect(placeFactsFromProperties({ external: { tripadvisor: { id: "d1" } } })).toEqual({});
    expect(placeFactsFromProperties(undefined)).toEqual({});
  });
});

describe("askFiltersOfQuery", () => {
  it("reads what find_places stored", () => {
    expect(askFiltersOfQuery({ intent: "dinner", popularityMax: 0.6, michelin: true, openDay: "monday" })).toEqual({
      popularityMax: 0.6,
      michelin: true,
      openDay: "monday",
    });
  });

  it("is empty for an older ask and ignores values it can not trust", () => {
    expect(askFiltersOfQuery({ intent: "dinner", priceMax: 2 })).toEqual({});
    expect(askFiltersOfQuery({ popularityMax: "0.6", michelin: "yes", openDay: "Monday" })).toEqual({});
  });
});

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
