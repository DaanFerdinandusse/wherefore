import { describe, expect, it } from "vitest";

import {
  askFiltersOfQuery,
  CARD_ABOUT_LIMIT,
  CARD_PRACTICAL_LIMIT,
  cardAbout,
  cardDishes,
  cardKeywords,
  cardMichelin,
  cardPopularity,
  cardPractical,
  cardPriceLevel,
  cardRating,
  choiceFacts,
  placeFactsFromProperties,
  placeFactsOf,
  PRACTICAL_TAGS_PATH,
  travelerFavorites,
} from "../map";

const tag = (type: string, name: string) => ({ tagId: `${type}:${name.toLowerCase().replaceAll(" ", "_")}`, name, type });

describe("cardRating", () => {
  it("keeps a rating above 0 up to 5 and nothing else", () => {
    expect(cardRating(4.4)).toBe(4.4);
    expect(cardRating(5)).toBe(5);
    expect(cardRating(0)).toBeUndefined();
    expect(cardRating(5.1)).toBeUndefined();
    expect(cardRating("4.4")).toBeUndefined();
    expect(cardRating(null)).toBeUndefined();
  });
});

describe("cardAbout", () => {
  it("keeps a short description as it is", () => {
    expect(cardAbout("  Rustic Italian trattoria.  ")).toBe("Rustic Italian trattoria.");
  });

  it("reads nothing from a blank or non-text value", () => {
    expect(cardAbout("   ")).toBeUndefined();
    expect(cardAbout(null)).toBeUndefined();
    expect(cardAbout(["a list"])).toBeUndefined();
  });

  it("keeps whole sentences when the first ones fit", () => {
    const first = `${"A rustic trattoria with handmade pasta ".repeat(3).trim()}.`;
    const text = `${first} ${"And a very long second sentence that will not fit ".repeat(4).trim()}.`;
    expect(cardAbout(text)).toBe(first);
  });

  it("cuts one long sentence at a word, under the cap, and marks the cut", () => {
    const text = `${"word ".repeat(60).trim()}, and more`;
    const out = cardAbout(text)!;
    expect(out.length).toBeLessThanOrEqual(CARD_ABOUT_LIMIT);
    expect(out.endsWith("word…")).toBe(true);
    expect(text.startsWith(out.slice(0, -1))).toBe(true);
  });

  it("never exceeds the cap, whatever the text", () => {
    for (const text of ["x".repeat(500), `${"ab. ".repeat(100)}`, `${"long ".repeat(39)}sentence ends here. And then more text after it.`]) {
      expect(cardAbout(text)!.length).toBeLessThanOrEqual(CARD_ABOUT_LIMIT);
    }
  });
});

describe("cardPractical", () => {
  it("reads every family and nothing else", () => {
    const out = cardPractical([
      tag("urn:tag:noise_level:qloo", "Loud"),
      tag("urn:tag:planning:place", "Reservations required"),
      tag("urn:tag:planning:place", "Usually a wait"),
      tag("urn:tag:dietary_option:qloo", "Vegan"),
      tag("urn:tag:children:place", "Good for kids"),
      tag("urn:tag:accessibility:place", "Wheelchair accessible entrance"),
      tag("urn:tag:event:place", "Date night"),
      tag("urn:tag:visit_intent:qloo", "Special occasion"),
      tag("urn:tag:ambience:qloo", "Cozy"),
      tag("urn:tag:specialty_dish:place", "Rigatoni"),
      tag("urn:tag:category:place", "Restaurant"),
    ]);
    expect(out).toEqual({
      noise: ["Loud"],
      planning: ["Reservations required", "Usually a wait"],
      dietary: ["Vegan"],
      children: ["Good for kids"],
      accessibility: ["Wheelchair accessible entrance"],
      occasion: ["Date night"],
      visit: ["Special occasion"],
    });
  });

  it("is undefined with no fact, so a card carries no empty block", () => {
    expect(cardPractical([tag("urn:tag:ambience:qloo", "Cozy")])).toBeUndefined();
    expect(cardPractical([])).toBeUndefined();
    expect(cardPractical(undefined)).toBeUndefined();
    expect(cardPractical("Vegan")).toBeUndefined();
  });

  it("drops malformed tags and repeats", () => {
    const type = "urn:tag:dietary_option:qloo";
    expect(cardPractical([tag(type, "Vegan"), tag(type, "Vegan"), { type }, { name: "Halal" }, null, "Vegan"])).toEqual({ dietary: ["Vegan"] });
  });

  it("cuts the visit and occasion families first, never a dietary or access fact", () => {
    const many = (type: string, count: number) => Array.from({ length: count }, (_, i) => tag(type, `${type}-${i}`));
    const out = cardPractical([
      ...many("urn:tag:visit_intent:qloo", 10),
      ...many("urn:tag:event:place", 10),
      ...many("urn:tag:dietary_option:qloo", 13),
      ...many("urn:tag:accessibility:place", 7),
    ])!;
    expect(out.dietary).toHaveLength(13);
    expect(out.accessibility).toHaveLength(7);
    expect(out.occasion).toHaveLength(CARD_PRACTICAL_LIMIT - 20);
    expect(out.visit).toBeUndefined();
  });

  it("selects the same families in the card query", () => {
    expect(PRACTICAL_TAGS_PATH.match(/@\.type == /g)).toHaveLength(7);
    expect(PRACTICAL_TAGS_PATH).toContain('"urn:tag:noise_level:qloo"');
  });
});

describe("placeFactsOf", () => {
  const place = {
    properties: {
      keywords: [{ name: "Pasta", count: 40 }],
      specialty_dishes: [{ name: "Cacio e pepe", weight: 1 }],
      popularity: 0.3,
      external: { michelin: [{ id: "1", stars: null }] },
      short_description: "Rustic trattoria.",
    },
    tags: [tag("urn:tag:dietary_option:qloo", "Vegetarian")],
    description: "Rustic trattoria.",
    rating: 4.6,
    priceLevel: 3,
  };

  it("carries the same facts as a card", () => {
    expect(placeFactsOf(place)).toEqual({
      keywords: [{ name: "Pasta", count: 40 }],
      dishes: ["Cacio e pepe"],
      popularity: 0.3,
      michelin: true,
      rating: 4.6,
      about: "Rustic trattoria.",
      practical: { dietary: ["Vegetarian"] },
      priceLevel: 3,
    });
  });

  it("takes the description in the provider's order, past a blank one", () => {
    const out = placeFactsOf({ ...place, description: null, properties: { short_description: " ", overall_description: "A long view." } });
    expect(out.about).toBe("A long view.");
  });

  it("leaves out what is unknown", () => {
    expect(placeFactsOf({ properties: {}, tags: [], description: null, rating: null, priceLevel: null })).toEqual({});
    expect(choiceFacts({ rating: null, about: null, tags: null })).toEqual({});
  });
});

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
