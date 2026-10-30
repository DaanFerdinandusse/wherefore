import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import portraitFixture from "./__fixtures__/insights-tags-portrait.json";
import insightsFixture from "./__fixtures__/insights-place.json";
import tagsFixture from "./__fixtures__/tags.json";
import { findPlaces, findTags, scoreEntities, tastePortrait } from "./api";
import { memoryCacheStore } from "./cache";
import { createQlooClient } from "./client";
import { QlooLocalityMismatchError } from "./errors";
import { CATEGORY_FILTER_TAGS, isUnpricedTagFilter } from "./normalize";

const template = insightsFixture.results.entities[0];

/** n insights results cloned from the Feitoria fixture, affinities descending. */
function entities(n: number, prefix: string) {
  return Array.from({ length: n }, (_, i) => ({
    ...template,
    entity_id: `${prefix}${i}`,
    name: `${prefix} place ${i}`,
    query: { ...template.query, affinity: 0.8 - i * 0.001 - (prefix === "loose" ? 0.01 : 0) },
  }));
}

function clientFor(handler: (url: URL) => unknown) {
  const urls: URL[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input));
    urls.push(url);
    return new Response(JSON.stringify(handler(url)), { status: 200 });
  });
  const client = createQlooClient({
    apiKey: "k",
    baseUrl: "https://api.example.test",
    fetch,
    store: memoryCacheStore(),
    sleep: async () => {},
  });
  return { client, urls };
}

const lisbon = { name: "Lisboa", disambiguation: "Lisboa, Portugal", countryCode: "PT", lat: 38.7427, lon: -9.1561, radiusM: 8500 };
const signals = ["3F659C60-D199-4E55-9B72-62DEEFB6AA11", "55E6BA87-F930-4AF0-AD01-D2A3AF0CF782"];

describe("findPlaces", () => {
  it("sends POINT(lon lat), radius, signals and explainability", async () => {
    const { client, urls } = clientFor(() => ({ success: true, results: { entities: entities(6, "strict") } }));
    const out = await findPlaces({ destination: lisbon, signals, take: 6 }, { client, tripId: "trip-1" });
    const q = urls[0].searchParams;
    expect(urls[0].pathname).toBe("/v2/insights");
    expect(q.get("filter.location")).toBe("POINT(-9.1561 38.7427)");
    expect(q.get("filter.location.radius")).toBe("8500");
    expect(q.get("signal.interests.entities")).toBe(signals.join(","));
    expect(q.get("feature.explainability")).toBe("true");
    expect(q.has("filter.location.query")).toBe(false);
    expect(out.loosened).toEqual([]);
    expect(out.results.map((r) => r.score)).toEqual([94, 87, 80, 74, 67, 60]);
    expect(out.results[0].signalScores.length).toBe(4);
    expect(out.results[0].category).toBe("eat");
    expect(out.calls).toHaveLength(1);
    expect(out.calls[0]).toMatchObject({ endpoint: "/v2/insights", count: 6, cached: false, tripId: "trip-1" });
    expect(out.localityCheck).toEqual({ requested: "Lisboa, Portugal", resolved: "Lisbon, Portugal", ok: true, dropped: 0 });
  });

  it("drops the tags, then the price cap, when fewer than 5 come back", async () => {
    const { client, urls } = clientFor((url) => {
      const q = url.searchParams;
      if (q.has("filter.tags")) return { results: { entities: entities(2, "strict") } };
      if (q.has("filter.price_level.max")) return { results: { entities: entities(1, "mid") } };
      return { results: { entities: entities(8, "loose") } };
    });
    const out = await findPlaces(
      { destination: lisbon, signals, tags: ["urn:tag:category:place:wine_bar"], priceMax: 2, take: 8 },
      { client },
    );
    expect(out.loosened).toEqual(["tags", "price"]);
    expect(urls).toHaveLength(3);
    expect(urls[1].searchParams.has("filter.tags")).toBe(false);
    expect(urls[1].searchParams.get("filter.price_level.max")).toBe("2");
    expect(urls[2].searchParams.has("filter.price_level.max")).toBe(false);
    // Strict results come first, then each looser step fills what is left.
    const ids = out.results.map((r) => r.place.entityId);
    expect(ids).toEqual(["strict0", "strict1", "mid0", "loose0", "loose1", "loose2", "loose3", "loose4"]);
    expect(out.calls).toHaveLength(3);
  });

  it("stops loosening as soon as there are enough", async () => {
    const { client, urls } = clientFor((url) =>
      url.searchParams.has("filter.tags")
        ? { results: { entities: entities(1, "strict") } }
        : { results: { entities: entities(6, "loose") } },
    );
    const out = await findPlaces(
      { destination: lisbon, signals, tags: ["urn:tag:category:place:cafe"], priceMax: 2, take: 8 },
      { client },
    );
    expect(out.loosened).toEqual(["tags"]);
    expect(urls).toHaveLength(2);
  });

  it("does not apply a price cap to a see or stay ask, and does not report it as loosened", async () => {
    for (const tags of [CATEGORY_FILTER_TAGS.see, CATEGORY_FILTER_TAGS.stay]) {
      const { client, urls } = clientFor((url) =>
        url.searchParams.has("filter.tags")
          ? { results: { entities: entities(2, "strict") } }
          : { results: { entities: entities(6, "loose") } },
      );
      const out = await findPlaces(
        { destination: lisbon, signals, tags, tagsOperator: "union", priceMax: 2, take: 8 },
        { client },
      );
      expect(urls.every((u) => !u.searchParams.has("filter.price_level.max"))).toBe(true);
      expect(out.loosened).toEqual(["price_not_applicable", "tags"]);
      expect(urls).toHaveLength(2);
    }
  });

  it("reports a price cap on a see or stay ask as not applied, even with enough results", async () => {
    const { client } = clientFor(() => ({ results: { entities: entities(6, "strict") } }));
    const out = await findPlaces(
      { destination: lisbon, signals, tags: CATEGORY_FILTER_TAGS.stay, priceMax: 2, take: 6 },
      { client },
    );
    expect(out.loosened).toEqual(["price_not_applicable"]);
    const plain = await findPlaces({ destination: lisbon, signals, tags: CATEGORY_FILTER_TAGS.stay, take: 6 }, { client });
    expect(plain.loosened).toEqual([]);
  });

  it("sends the less known, Michelin and open day filters", async () => {
    const { client, urls } = clientFor(() => ({ results: { entities: entities(6, "strict") } }));
    const out = await findPlaces(
      { destination: lisbon, signals, popularityMax: 0.6, michelin: true, openDay: "monday", take: 6 },
      { client },
    );
    const q = urls[0].searchParams;
    expect(q.get("filter.popularity.max")).toBe("0.6");
    expect(q.get("filter.external.exists")).toBe("michelin");
    expect(q.get("filter.hours")).toBe("monday");
    expect(urls).toHaveLength(1);
    expect(out.loosened).toEqual([]);
  });

  it("sends none of them unless asked", async () => {
    const { client, urls } = clientFor(() => ({ results: { entities: entities(6, "strict") } }));
    await findPlaces({ destination: lisbon, signals, take: 6 }, { client });
    const q = urls[0].searchParams;
    expect(q.has("filter.popularity.max") || q.has("filter.external.exists") || q.has("filter.hours")).toBe(false);
  });

  it("drops tags, popularity, Michelin, price and last the open day, each step keeping the earlier drops", async () => {
    const { client, urls } = clientFor(() => ({ results: { entities: [] } }));
    const out = await findPlaces(
      {
        destination: lisbon,
        signals,
        tags: ["urn:tag:category:place:wine_bar"],
        popularityMax: 0.6,
        michelin: true,
        priceMax: 2,
        openDay: "monday",
        take: 5,
      },
      { client },
    );
    const keys = ["filter.tags", "filter.popularity.max", "filter.external.exists", "filter.price_level.max", "filter.hours"];
    expect(urls.map((url) => keys.filter((key) => url.searchParams.has(key)))).toEqual([
      keys,
      keys.slice(1),
      keys.slice(2),
      keys.slice(3),
      keys.slice(4),
      [],
    ]);
    expect(out.loosened).toEqual(["tags", "popularity", "michelin", "price", "hours"]);
  });

  it("keeps the open day while another drop finds enough, and fills from it first", async () => {
    const { client, urls } = clientFor((url) => {
      const q = url.searchParams;
      if (q.has("filter.popularity.max")) return { results: { entities: entities(2, "strict") } };
      return { results: { entities: entities(6, "open") } };
    });
    const out = await findPlaces({ destination: lisbon, signals, popularityMax: 0.6, openDay: "friday", take: 6 }, { client });
    expect(out.loosened).toEqual(["popularity"]);
    expect(urls).toHaveLength(2);
    expect(urls[1].searchParams.get("filter.hours")).toBe("friday");
    expect(out.results.map((r) => r.place.entityId).slice(0, 3)).toEqual(["strict0", "strict1", "open0"]);
  });

  it("never comes back empty because of the open day: the closed day goes and says so", async () => {
    const { client } = clientFor((url) =>
      url.searchParams.has("filter.hours") ? { results: { entities: [] } } : { results: { entities: entities(5, "loose") } },
    );
    const out = await findPlaces({ destination: lisbon, signals, openDay: "monday", take: 5 }, { client });
    expect(out.loosened).toEqual(["hours"]);
    expect(out.results).toHaveLength(5);
  });

  it("never lets a looser result displace a strict one, even with a higher affinity", async () => {
    const { client } = clientFor((url) => {
      if (url.searchParams.has("filter.tags")) {
        return { results: { entities: entities(3, "strict").map((e) => ({ ...e, query: { ...e.query, affinity: 0.5 } })) } };
      }
      return { results: { entities: entities(10, "loose") } };
    });
    const out = await findPlaces(
      { destination: lisbon, signals, tags: ["urn:tag:category:place:wine_bar"], take: 5 },
      { client },
    );
    expect(out.results.map((r) => r.place.entityId)).toEqual(["strict0", "strict1", "strict2", "loose0", "loose1"]);
  });

  it("still applies the price cap when an ask mixes in a priced category", async () => {
    const { client, urls } = clientFor(() => ({ results: { entities: entities(6, "strict") } }));
    await findPlaces(
      { destination: lisbon, signals, tags: [...CATEGORY_FILTER_TAGS.see, ...CATEGORY_FILTER_TAGS.eat], priceMax: 2, take: 6 },
      { client },
    );
    expect(urls[0].searchParams.get("filter.price_level.max")).toBe("2");
  });

  it("throws when results came back but none is near the destination", async () => {
    // The fixture places are in Lisbon; the trip is in Copenhagen.
    const copenhagen = { name: "Copenhagen", countryCode: "DK", lat: 55.6761, lon: 12.5683, radiusM: 8000 };
    const { client } = clientFor(() => ({
      results: { entities: entities(5, "strict").map((e) => ({ ...e, query: { ...e.query, distance: undefined } })) },
    }));
    await expect(findPlaces({ destination: copenhagen, signals, take: 5 }, { client })).rejects.toBeInstanceOf(
      QlooLocalityMismatchError,
    );
  });

  it("drops far results in the same country, computing the distance when the API gives none", async () => {
    // Porto results for a Lisbon trip: same country, about 275 km away, no distance.
    const porto = { lat: 41.1496, lon: -8.611 };
    const { client, urls } = clientFor((url) => {
      if (!url.searchParams.has("filter.tags")) return { results: { entities: entities(5, "loose") } };
      const near = entities(3, "strict");
      const far = entities(2, "far").map((e) => ({
        ...e,
        location: { ...e.location, ...porto },
        query: { ...e.query, distance: undefined, affinity: 0.9 },
      }));
      return { results: { entities: [...far, ...near] } };
    });
    const out = await findPlaces(
      { destination: lisbon, signals, tags: ["urn:tag:category:place:wine_bar"], take: 8 },
      { client },
    );
    const ids = out.results.map((r) => r.place.entityId);
    expect(ids.some((id) => id.startsWith("far"))).toBe(false);
    expect(ids.slice(0, 3)).toEqual(["strict0", "strict1", "strict2"]);
    // Only 3 near strict results, so the tags were dropped to fill the set.
    expect(urls).toHaveLength(2);
    expect(out.loosened).toEqual(["tags"]);
    expect(out.localityCheck).toMatchObject({ ok: true, dropped: 2 });
    expect(out.results.every((r) => r.distanceM !== null)).toBe(true);
  });
});

describe("scoreEntities", () => {
  it("scores a shortlist with filter.results.entities and explains it by name", async () => {
    const { client, urls } = clientFor(() => insightsFixture);
    const ids = insightsFixture.results.entities.map((e) => e.entity_id);
    const { scores } = await scoreEntities(
      {
        signals,
        entityIds: ids,
        favorites: [
          { entityId: signals[0], name: "Via Carota" },
          { entityId: signals[1], name: "Lilia" },
        ],
      },
      { client },
    );
    expect(urls[0].searchParams.get("filter.results.entities")).toBe(ids.join(","));
    expect(urls[0].searchParams.get("take")).toBe(String(ids.length));
    expect(scores[0].affinity).toBeGreaterThanOrEqual(scores[1].affinity);
    // Two of the four signals are named; the other two share one entry.
    expect(scores[0].explainability.map((e) => e.name)).toEqual(["Via Carota", "Lilia", "Other favorites"]);
    expect(scores[0].explainability.reduce((s, e) => s + e.share, 0)).toBe(100);
  });

  it("makes no call for an empty shortlist", async () => {
    const { client, urls } = clientFor(() => insightsFixture);
    expect(await scoreEntities({ signals, entityIds: [] }, { client })).toEqual({ scores: [], calls: [] });
    expect(urls).toHaveLength(0);
  });
});

describe("tastePortrait and findTags", () => {
  it("asks for ambience, cuisine and decor tags and merges same-name tags", async () => {
    const { client, urls } = clientFor(() => portraitFixture);
    const { tags } = await tastePortrait(signals, { client });
    expect(urls[0].searchParams.get("filter.type")).toBe("urn:tag");
    expect(urls[0].searchParams.get("filter.tag.types")).toBe(
      "urn:tag:ambience:qloo,urn:tag:cuisine:qloo,urn:tag:decor:qloo",
    );
    expect(urls[0].searchParams.get("take")).toBe("20");
    expect(tags[0]).toMatchObject({ tagId: "urn:tag:decor:qloo:european", name: "European", type: "urn:tag:decor:qloo" });
    const names = tags.map((t) => t.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("cozy");
  });

  it("maps free text to place tag ids", async () => {
    const { client, urls } = clientFor(() => tagsFixture);
    const { tags } = await findTags("natural wine", { client });
    expect(urls[0].pathname).toBe("/v2/tags");
    expect(urls[0].searchParams.get("filter.parents.types")).toBe("urn:entity:place");
    expect(tags).toContainEqual({
      tagId: "urn:tag:genre:place:restaurant:natural_wine",
      name: "Natural Wine",
      type: "urn:tag:genre:place",
    });
  });
});

describe("isUnpricedTagFilter", () => {
  it("is true only when every tag is a see or stay category", () => {
    expect(isUnpricedTagFilter(["urn:tag:category:place:museum", "urn:tag:category:place:tourist_attraction"])).toBe(true);
    expect(isUnpricedTagFilter(["urn:tag:category:place:hotel"])).toBe(true);
    expect(isUnpricedTagFilter(["urn:tag:category:place:art_gallery"])).toBe(true);
    expect(isUnpricedTagFilter(["urn:tag:category:place:hotel", "urn:tag:category:place:wine_bar"])).toBe(false);
    expect(isUnpricedTagFilter(["urn:tag:genre:place:restaurant:natural_wine"])).toBe(false);
    expect(isUnpricedTagFilter(["urn:tag:ambience:qloo:cozy"])).toBe(false);
    expect(isUnpricedTagFilter([])).toBe(false);
  });
});
