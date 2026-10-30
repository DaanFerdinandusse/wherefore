import { describe, expect, it } from "vitest";

import entitiesFixture from "./__fixtures__/entities.json";
import cocktailFixture from "./__fixtures__/insights-cocktail-bar.json";
import insightsFixture from "./__fixtures__/insights-place.json";
import localityFixture from "./__fixtures__/search-locality.json";
import searchFixture from "./__fixtures__/search-place.json";
import type { PlaceResult } from "./contracts";
import {
  categoryOf,
  checkLocality,
  cidFromHex,
  cidToHex,
  OTHER_FAVORITES_ID,
  displayScore,
  distanceFromDestination,
  explainabilityFor,
  isTooFar,
  normalizeLocality,
  normalizePlace,
  radiusFromBoundary,
  sharedTagsFor,
  signalScoresOf,
} from "./normalize";
import {
  entitiesResponseSchema,
  insightsPlacesResponseSchema,
  localitySearchResponseSchema,
  searchResponseSchema,
} from "./types";

const search = searchResponseSchema.parse(searchFixture);
const insights = insightsPlacesResponseSchema.parse(insightsFixture);
const cocktail = insightsPlacesResponseSchema.parse(cocktailFixture);
const entities = entitiesResponseSchema.parse(entitiesFixture);
const localities = localitySearchResponseSchema.parse(localityFixture);

const FAVORITES = [
  { entityId: "3F659C60-D199-4E55-9B72-62DEEFB6AA11", name: "Via Carota" },
  { entityId: "55E6BA87-F930-4AF0-AD01-D2A3AF0CF782", name: "Lilia" },
  { entityId: "273C2859-742C-4DD2-88A9-0A07C5551C55", name: "Death & Co East Village" },
  { entityId: "75A227CA-9221-44C0-96C4-A2F3CCD0CA24", name: "Ace Hotel New York" },
];

describe("normalizePlace", () => {
  it("maps a /search result (google_place as an object under properties.external)", () => {
    const place = normalizePlace(search.results[0]);
    expect(place).toMatchObject({
      entityId: "3F659C60-D199-4E55-9B72-62DEEFB6AA11",
      name: "Via Carota",
      address: "51 Grove St New York, NY 10014",
      city: "New York",
      neighborhood: "West Village",
      primaryType: "urn:tag:genre:place:restaurant:italian",
      priceLevel: 3,
      rating: 4.4,
      ratingCount: null,
      googlePlaceId: "ChIJr7FOf5NZwokRu3CDYtzVmuQ",
      googleCid: "16472713729583313083",
    });
    expect(place.lat).toBeCloseTo(40.7332, 3);
    expect(place.lon).toBeCloseTo(-74.0036, 3);
    expect(place.types).toEqual(["urn:tag:category:place:italian_restaurant"]);
    expect(place.description).toMatch(/Italian trattoria/);
    expect(place.images[0]?.url).toMatch(/^https:\/\/images\./);
    expect(place.properties).toHaveProperty("hours");
    expect(place.properties).toHaveProperty("website", "http://viacarota.com/");
    expect(place.properties).toHaveProperty("specialty_dishes");
    expect(JSON.stringify(place.properties)).not.toContain('"akas"');
    // tags: unique ids, every one named
    const ids = place.tags.map((t) => t.tagId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(place.tags.every((t) => t.name.length > 0)).toBe(true);
  });

  it("maps a /v2/insights result (google_place as an array under top-level external)", () => {
    const raw = insights.results.entities[0];
    const place = normalizePlace(raw);
    expect(place.name).toBe("Feitoria");
    expect(place.googlePlaceId).toBe("ChIJh32rQULLHg0RkgF8wCakjIk");
    expect(place.googleCid).toBe("9911477366280683922");
    expect(place.priceLevel).toBe(4);
    expect(place.rating).toBe(4.8);
    expect(place.city).toBe("Lisbon");
    expect(place.neighborhood).toBe("Pedrouços");
    expect(place.properties).toHaveProperty("keywords");
    expect(place.properties).toHaveProperty("ambience_description");
    expect(place.properties).toHaveProperty("external.michelin");
    expect(place.properties).not.toHaveProperty("localities");
    // insights tags use `id`, not `tag_id`
    expect(place.tags.length).toBeGreaterThan(50);
  });

  it("maps an /entities result", () => {
    const place = normalizePlace(entities.results[0]);
    expect(place.name).toBe("Tapisco | Tapas e Petiscos");
    expect(place.googlePlaceId).toBe("ChIJL9EDcn8zGQ0RioyOgCtzg4E");
    expect(place.googleCid).toBe("9332429483519413386");
  });

  it("returns nulls, not undefined, for a bare entity", () => {
    const place = normalizePlace({ entity_id: "X", name: " Bare " });
    expect(place).toEqual({
      entityId: "X",
      name: "Bare",
      address: null,
      city: null,
      neighborhood: null,
      lat: null,
      lon: null,
      primaryType: null,
      types: [],
      priceLevel: null,
      rating: null,
      ratingCount: null,
      description: null,
      images: [],
      tags: [],
      properties: {},
      googlePlaceId: null,
      googleCid: null,
    });
  });
});

describe("google cid", () => {
  it("decodes the hex id to the decimal CID (Contramar example)", () => {
    expect(cidFromHex("e8a4468e5f14a3f")).toBe("1047725080642144831");
    expect(cidToHex("1047725080642144831")).toBe("e8a4468e5f14a3f");
    expect(cidFromHex("not-hex")).toBeNull();
  });
});

describe("categoryOf", () => {
  it("keeps sweets out of the meals", () => {
    expect(categoryOf({ primaryType: "urn:tag:genre:place:restaurant:ice_cream_shop", types: [] })).toBe("coffee");
  });

  const byName = (name: string) => {
    const raw = cocktail.results.entities.find((e) => e.name === name);
    if (!raw) throw new Error(`fixture has no ${name}`);
    return normalizePlace(raw);
  };

  it("keeps a restaurant tagged cocktail_bar in eat", () => {
    const ludos = byName("LUDO'S");
    expect(ludos.types).toContain("urn:tag:category:place:cocktail_bar");
    expect(categoryOf(ludos)).toBe("eat");
  });

  it("puts a real cocktail bar in drink", () => {
    expect(categoryOf(byName("Red Frog"))).toBe("drink");
  });

  it.each([
    ["urn:tag:genre:place:hotel", [], "stay"],
    ["urn:tag:genre:place:art_museum", [], "see"],
    ["urn:tag:genre:place:museum", [], "see"],
    ["urn:tag:genre:place:restaurant:cafe", [], "coffee"],
    ["urn:tag:genre:place:restaurant:coffee_roastery", [], "coffee"],
    ["urn:tag:genre:place:restaurant:bakery", [], "coffee"],
    ["urn:tag:genre:place:restaurant:wine_bar", [], "drink"],
    ["urn:tag:genre:place:restaurant:tapas_bar", [], "eat"],
    ["urn:tag:genre:place:restaurant:brunch", [], "eat"],
    // The beer restaurant the museum filter returned
    ["urn:tag:genre:place:restaurant:portuguese", ["urn:tag:category:place:museum"], "eat"],
    [null, ["urn:tag:category:place:hotel"], "stay"],
    [null, ["urn:tag:category:place:museum", "urn:tag:category:place:tourist_attraction"], "see"],
    [null, ["urn:tag:category:place:cocktail_bar", "urn:tag:category:place:italian_restaurant"], "eat"],
    [null, ["urn:tag:category:place:wine_bar"], "drink"],
    [null, [], "other"],
  ] as const)("%s %j -> %s", (primaryType, types, expected) => {
    expect(categoryOf({ primaryType, types: [...types] })).toBe(expected);
  });
});

describe("displayScore", () => {
  const set = [0.7999, 0.7966, 0.7955, 0.794, 0.7932];

  it("gives the top 94 and the bottom 60", () => {
    expect(displayScore(0.7999, set)).toBe(94);
    expect(displayScore(0.7932, set)).toBe(60);
  });

  it("spaces by rank, not by the raw decimal", () => {
    const scores = set.map((a) => displayScore(a, set));
    expect(scores).toEqual([94, 86, 77, 69, 60]);
  });

  it("gives ties the same score", () => {
    expect(displayScore(0.5, [0.5, 0.5, 0.4])).toBe(94);
    expect(displayScore(0.4, [0.5, 0.5, 0.4])).toBe(60);
  });

  it("handles a set of one and an empty set", () => {
    expect(displayScore(0.3, [0.3])).toBe(94);
    expect(displayScore(0.3, [])).toBe(94);
  });

  it("scores an affinity below the whole set under 60", () => {
    expect(displayScore(0.6, set)).toBeLessThan(60);
    expect(displayScore(0.81, set)).toBe(94);
  });
});

describe("explainabilityFor", () => {
  it("turns the fixture's per-input scores into integer shares summing to 100", () => {
    const result = { signalScores: signalScoresOf(insights.results.entities[0]) };
    const because = explainabilityFor(result, FAVORITES);
    expect(because).toEqual([
      { entityId: FAVORITES[0].entityId, name: "Via Carota", share: 28 },
      { entityId: FAVORITES[1].entityId, name: "Lilia", share: 26 },
      { entityId: FAVORITES[2].entityId, name: "Death & Co East Village", share: 25 },
      { entityId: FAVORITES[3].entityId, name: "Ace Hotel New York", share: 21 },
    ]);
  });

  it("rounds thirds to 34, 33, 33", () => {
    const because = explainabilityFor(
      {
        signalScores: [
          { entityId: "a", score: 1 },
          { entityId: "b", score: 1 },
          { entityId: "c", score: 1 },
        ],
      },
      [
        { entityId: "a", name: "A" },
        { entityId: "b", name: "B" },
        { entityId: "c", name: "C" },
      ],
    );
    expect(because.map((b) => b.share).sort()).toEqual([33, 33, 34]);
    expect(because.reduce((s, b) => s + b.share, 0)).toBe(100);
  });

  it("keeps inputs without a name as one Other favorites entry, never rescaled away", () => {
    const because = explainabilityFor(
      {
        signalScores: [
          { entityId: "a", score: 0.3 },
          { entityId: "unknown", score: 0.4 },
          { entityId: "b", score: 0.1 },
          { entityId: "unknown-2", score: 0.1 },
        ],
      },
      [
        { entityId: "a", name: "A" },
        { entityId: "b", name: "B" },
      ],
    );
    // 0.3 / 0.9 = 33.3, 0.1 / 0.9 = 11.1, 0.5 / 0.9 = 55.6 (other, listed last).
    expect(because).toEqual([
      { entityId: "a", name: "A", share: 33 },
      { entityId: "b", name: "B", share: 11 },
      { entityId: OTHER_FAVORITES_ID, name: "Other favorites", share: 56 },
    ]);
    expect(because.reduce((s, b) => s + b.share, 0)).toBe(100);
  });

  it("is empty when no driver has a name", () => {
    const because = explainabilityFor({ signalScores: [{ entityId: "unknown", score: 0.9 }] }, FAVORITES);
    expect(because).toEqual([]);
  });

  it("is empty without explainability", () => {
    expect(explainabilityFor({ signalScores: [] }, FAVORITES)).toEqual([]);
  });
});

describe("sharedTagsFor", () => {
  it("matches by id and by name across tag families, in portrait order", () => {
    const place = {
      tags: [
        { tagId: "urn:tag:decor:qloo:cozy", name: "Cozy" },
        { tagId: "urn:tag:ambience:qloo:trendy", name: "Trendy" },
      ],
    };
    const portrait = [
      { tagId: "urn:tag:ambience:qloo:trendy", name: "Trendy", score: 0.9 },
      { tagId: "urn:tag:ambience:qloo:cozy", name: "Cozy", score: 0.87 },
      { tagId: "urn:tag:decor:qloo:cozy", name: "Cozy", score: 0.8 },
      { tagId: "urn:tag:ambience:qloo:moody", name: "Moody", score: 0.7 },
    ];
    expect(sharedTagsFor(place, portrait).map((t) => t.tagId)).toEqual([
      "urn:tag:ambience:qloo:trendy",
      "urn:tag:ambience:qloo:cozy",
    ]);
  });
});

describe("localities", () => {
  it("normalizes a locality with country code and a radius from its boundary", () => {
    const [lisboa, connecticut] = localities.results.map(normalizeLocality);
    expect(lisboa).toMatchObject({ name: "Lisboa", disambiguation: "Lisboa, Lisboa, Portugal", countryCode: "PT" });
    expect(lisboa.radiusM).toBeGreaterThanOrEqual(6000);
    expect(lisboa.radiusM).toBeLessThanOrEqual(12000);
    expect(connecticut.countryCode).toBe("US");
  });

  it("falls back to 8 km without a boundary and clamps tiny ones", () => {
    expect(radiusFromBoundary(null)).toBe(8000);
    expect(radiusFromBoundary("POLYGON ((0 0, 0.001 0.001))")).toBe(2000);
  });

  it("checks results against the destination", () => {
    const results = insights.results.entities.map(
      (raw): PlaceResult => ({
        place: normalizePlace(raw),
        category: "eat",
        affinity: raw.query.affinity,
        score: 0,
        signalScores: [],
        distanceM: raw.query.distance ?? null,
      }),
    );
    const lisbon = { name: "Lisboa", countryCode: "PT", lat: 38.74, lon: -9.15, radiusM: 8500 };
    expect(checkLocality(lisbon, results)).toEqual({
      requested: "Lisboa",
      resolved: "Lisbon, Portugal",
      ok: true,
      dropped: 0,
    });
    expect(checkLocality({ ...lisbon, countryCode: "US" }, results).ok).toBe(false);
    expect(checkLocality({ ...lisbon, radiusM: 1000 }, results).ok).toBe(false);
    expect(checkLocality(lisbon, results, undefined, 3).dropped).toBe(3);
  });

  it("computes a missing distance from the coordinates instead of counting it as near", () => {
    const [raw] = insights.results.entities;
    const place = normalizePlace(raw);
    const result: PlaceResult = { place, category: "eat", affinity: 0.8, score: 0, signalScores: [], distanceM: null };
    // Feitoria sits about 7 km from this point.
    const near = { name: "Lisboa", countryCode: "PT", lat: 38.74, lon: -9.15, radiusM: 8500 };
    expect(checkLocality(near, [result]).ok).toBe(true);
    // Porto: same country, about 270 km away. Without a distance this used to pass.
    const porto = { name: "Porto", countryCode: "PT", lat: 41.1579, lon: -8.6291, radiusM: 8000 };
    expect(checkLocality(porto, [result]).ok).toBe(false);
    // No distance and no coordinates: not near.
    const bare: PlaceResult = { ...result, place: { ...place, lat: null, lon: null } };
    expect(checkLocality(near, [bare]).ok).toBe(false);
  });

  it("measures distance from the API first, then from the coordinates", () => {
    const point = { lat: 38.74, lon: -9.15 };
    expect(distanceFromDestination(point, { lat: 0, lon: 0 }, 1234)).toBe(1234);
    expect(distanceFromDestination(point, { lat: 38.74, lon: -9.15 }, null)).toBe(0);
    expect(distanceFromDestination(point, { lat: null, lon: null })).toBeNull();
    const d = distanceFromDestination(point, { lat: 41.1579, lon: -8.6291 }) ?? 0;
    expect(d).toBeGreaterThan(260_000);
    expect(d).toBeLessThan(280_000);
  });

  it("calls a result too far only past 1.5x the radius", () => {
    expect(isTooFar({ radiusM: 8000 }, 12_000)).toBe(false);
    expect(isTooFar({ radiusM: 8000 }, 12_001)).toBe(true);
    expect(isTooFar({ radiusM: 8000 }, null)).toBe(false);
  });
});
