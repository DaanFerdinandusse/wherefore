import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import portraitFixture from "./__fixtures__/insights-tags-portrait.json";
import insightsFixture from "./__fixtures__/insights-place.json";
import tagsFixture from "./__fixtures__/tags.json";
import { findPlaces, findTags, scoreEntities, tastePortrait } from "./api";
import { memoryCacheStore } from "./cache";
import { createQlooClient } from "./client";
import { MAX_EXCLUDED, MAX_SIGNALS } from "../agent/tools/signals";
import type { QlooCall } from "./contracts";
import { QlooLocalityMismatchError } from "./errors";
import { CATEGORY_FILTER_TAGS, closedOn, isCategoryTagFilter, isUnpricedTagFilter, openDuring } from "./normalize";

const template = insightsFixture.results.entities[0];
const SEAFOOD = "urn:tag:genre:place:restaurant:seafood";

/** n insights results cloned from the Feitoria fixture, affinities descending. */
function entities(n: number, prefix: string) {
  return Array.from({ length: n }, (_, i) => ({
    ...template,
    entity_id: `${prefix}${i}`,
    name: `${prefix} place ${i}`,
    query: { ...template.query, affinity: 0.8 - i * 0.001 - (prefix === "loose" ? 0.01 : 0) },
  }));
}

function clientFor(handler: (url: URL) => unknown, handlesEntities = false) {
  const urls: URL[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input));
    // Hours come from /entities after every search, and count for nothing here.
    if (url.pathname === "/entities" && !handlesEntities) return new Response(JSON.stringify({ success: true, results: [] }), { status: 200 });
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
    expect(out.calls.filter((c) => c.endpoint === "/v2/insights")).toHaveLength(1);
    expect(out.calls[0]).toMatchObject({ endpoint: "/v2/insights", count: 6, cached: false, tripId: "trip-1" });
    expect(out.localityCheck).toEqual({ requested: "Lisboa, Portugal", resolved: "Lisbon, Portugal", ok: true, dropped: 0 });
  });

  describe("without signals (a client with no favorites)", () => {
    const unscored = (n: number) =>
      entities(n, "plain").map(({ query, ...rest }) => {
        const { affinity, ...others } = query;
        void affinity;
        return { ...rest, query: others };
      });

    it("keeps the API's order and leaves every place without a score", async () => {
      const { client, urls } = clientFor(() => ({ results: { entities: unscored(5) } }));
      const out = await findPlaces({ destination: lisbon, signals: [], take: 5 }, { client });
      const q = urls[0].searchParams;
      expect(q.has("signal.interests.entities")).toBe(false);
      expect(q.has("feature.explainability")).toBe(false);
      expect(out.results.map((r) => r.place.entityId)).toEqual(["plain0", "plain1", "plain2", "plain3", "plain4"]);
      expect(out.results.every((r) => r.affinity === null && r.score === null)).toBe(true);
    });

    it("still refuses a search with signals that comes back without affinities", async () => {
      const { client } = clientFor(() => ({ results: { entities: unscored(5) } }));
      await expect(findPlaces({ destination: lisbon, signals, take: 5 }, { client })).rejects.toThrow(/unexpected shape/);
    });
  });

  describe("wider circles", () => {
    /** The search steps the result was built from, in order. Steps left over from asking ahead are not among them. */
    const steps = (calls: readonly QlooCall[]) => calls.filter((c) => c.endpoint === "/v2/insights");
    const radii = (calls: readonly QlooCall[]) => steps(calls).map((c) => String(c.params["filter.location.radius"]));
    const small = { ...lisbon, radiusM: 2_500 };
    const tags = ["urn:tag:category:place:wine_bar"];
    const widen = [{ radiusM: 5_000 }, { radiusM: 8_000 }, { radiusM: 25_000, below: 3 }];
    /** Exact matches per circle; a wider circle holds the places of the smaller ones, as the API does. */
    const byRadius = (counts: Record<string, number>) => (url: URL) => {
      const radius = url.searchParams.get("filter.location.radius") ?? "";
      const tagged = url.searchParams.has("filter.tags");
      const rows = tagged ? entities(counts[radius] ?? 0, "exact") : entities(6, "open");
      return { results: { entities: rows.map((row) => ({ ...row, query: { ...row.query, distance: 100 } })) } };
    };

    it("stops at the first circle with enough places", async () => {
      const { client } = clientFor(byRadius({ 2500: 5 }));
      const out = await findPlaces({ destination: small, widen, signals, tags, take: 5 }, { client });
      expect(radii(out.calls)).toEqual(["2500"]);
      expect(out.radiusM).toBe(2_500);
      expect(out.loosened).toEqual([]);
    });

    it("goes wider before it drops a filter, closest places first", async () => {
      const { client } = clientFor(byRadius({ 2500: 2, 5000: 5 }));
      const out = await findPlaces({ destination: small, widen, signals, tags, take: 5 }, { client });
      expect(radii(out.calls)).toEqual(["2500", "5000"]);
      expect(out.radiusM).toBe(5_000);
      expect(out.loosened).toEqual([]);
      expect(out.results.map((r) => r.place.entityId)).toEqual(["exact0", "exact1", "exact2", "exact3", "exact4"]);
    });

    it("leaves the last resort circle out while a few exact matches exist, and drops the tags close by", async () => {
      const { client, urls } = clientFor(byRadius({ 2500: 1, 5000: 2, 8000: 3 }));
      const out = await findPlaces({ destination: small, widen, signals, tags, take: 5 }, { client });
      expect(radii(out.calls)).toEqual(["2500", "5000", "8000", "8000"]);
      expect(steps(out.calls)[3]?.params).not.toHaveProperty("filter.tags");
      expect(urls.some((u) => u.searchParams.get("filter.location.radius") === "25000")).toBe(false);
      expect(out.radiusM).toBe(8_000);
      expect(out.loosened).toEqual(["tags"]);
    });

    it("searches the last resort circle when almost nothing matches", async () => {
      const { client } = clientFor(byRadius({ 25000: 5 }));
      const out = await findPlaces({ destination: small, widen, signals, tags, take: 5 }, { client });
      expect(radii(out.calls)).toEqual(["2500", "5000", "8000", "25000"]);
      expect(out.radiusM).toBe(25_000);
      expect(out.loosened).toEqual([]);
    });

    it("keeps its 1.5x distance guard for each circle", async () => {
      const rows = entities(6, "near").map((row, i) => ({ ...row, query: { ...row.query, distance: i === 0 ? 4_000 : 100 } }));
      const { client } = clientFor(() => ({ results: { entities: rows } }));
      const out = await findPlaces({ destination: small, signals, take: 6 }, { client });
      expect(out.results.map((r) => r.place.entityId)).not.toContain("near0");
      expect(out.localityCheck.dropped).toBe(1);
    });

    it("lets a wider circle keep a place that was too far for a smaller one", async () => {
      const rows = entities(6, "near").map((row, i) => ({ ...row, query: { ...row.query, distance: i < 2 ? 4_000 : 100 } }));
      const { client } = clientFor(() => ({ results: { entities: rows } }));
      const out = await findPlaces({ destination: small, widen, signals, take: 6 }, { client });
      expect(out.results.map((r) => r.place.entityId)).toContain("near0");
      expect(out.localityCheck.dropped).toBe(0);
    });
  });

  describe("noShopping", () => {
    const mainly =(genre: string, id: string) => {
      const entity = entities(1, id)[0]!;
      return { ...entity, properties: { ...entity.properties, primary_genre: { id: `urn:tag:genre:place:${genre}` } } };
    };

    it("leaves out malls, keeps food halls, and asks for spares so the list stays full", async () => {
      const rows = [mainly("shopping_mall", "mall"), mainly("restaurant:food_court", "hall"), ...entities(6, "strict")];
      const { client, urls } = clientFor(() => ({ results: { entities: rows } }));
      const out = await findPlaces({ destination: lisbon, signals, noShopping: true, take: 5 }, { client });
      expect(urls[0].searchParams.get("take")).toBe("10");
      const ids = out.results.map((r) => r.place.entityId);
      expect(ids).toHaveLength(5);
      expect(ids).not.toContain("mall0");
      expect(ids).toContain("hall0");
    });

    it("keeps malls and asks for the usual number otherwise", async () => {
      const { client, urls } = clientFor(() => ({ results: { entities: [mainly("shopping_mall", "mall"), ...entities(5, "strict")] } }));
      const out = await findPlaces({ destination: lisbon, signals, take: 5 }, { client });
      expect(urls[0].searchParams.get("take")).toBe("5");
      expect(out.results.map((r) => r.place.entityId)).toContain("mall0");
    });
  });

  it("drops the tags, then the price cap, when fewer than 5 come back", async () => {
    const { client, urls } = clientFor((url) => {
      const q = url.searchParams;
      if (q.has("filter.tags")) return { results: { entities: entities(2, "strict") } };
      if (q.has("filter.price_level.max")) return { results: { entities: entities(1, "mid") } };
      return { results: { entities: entities(8, "loose") } };
    });
    const out = await findPlaces(
      { destination: lisbon, signals, tags: [SEAFOOD], priceMax: 2, take: 8 },
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
    expect(out.calls.filter((c) => c.endpoint === "/v2/insights")).toHaveLength(3);
  });

  it("stops loosening as soon as there are enough", async () => {
    const { client } = clientFor((url) =>
      url.searchParams.has("filter.tags")
        ? { results: { entities: entities(1, "strict") } }
        : { results: { entities: entities(6, "loose") } },
    );
    const out = await findPlaces(
      { destination: lisbon, signals, tags: [SEAFOOD], priceMax: 2, take: 8 },
      { client },
    );
    expect(out.loosened).toEqual(["tags"]);
    expect(out.calls.filter((c) => c.endpoint === "/v2/insights")).toHaveLength(2);
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
      { destination: lisbon, signals, popularityMax: 0.6, michelin: true, openDay: "friday", take: 6 },
      { client },
    );
    const q = urls[0].searchParams;
    expect(q.get("filter.popularity.max")).toBe("0.6");
    expect(q.get("filter.external.exists")).toBe("michelin");
    expect(q.has("filter.hours")).toBe(false);
    expect(q.get("take")).toBe("18");
    expect(urls).toHaveLength(1);
    expect(out.loosened).toEqual([]);
  });

  it("sends none of them unless asked", async () => {
    const { client, urls } = clientFor(() => ({ results: { entities: entities(6, "strict") } }));
    await findPlaces({ destination: lisbon, signals, take: 6 }, { client });
    const q = urls[0].searchParams;
    expect(q.has("filter.popularity.max") || q.has("filter.external.exists") || q.has("filter.hours")).toBe(false);
  });

  it("drops tags, popularity, Michelin and price, each step keeping the earlier drops", async () => {
    const { client, urls } = clientFor(() => ({ results: { entities: [] } }));
    const out = await findPlaces(
      {
        destination: lisbon,
        signals,
        tags: [SEAFOOD],
        popularityMax: 0.6,
        michelin: true,
        priceMax: 2,
        openDay: "monday",
        take: 5,
      },
      { client },
    );
    const keys = ["filter.tags", "filter.popularity.max", "filter.external.exists", "filter.price_level.max"];
    expect(urls.map((url) => keys.filter((key) => url.searchParams.has(key)))).toEqual([
      keys,
      keys.slice(1),
      keys.slice(2),
      keys.slice(3),
      [],
    ]);
    expect(out.loosened).toEqual(["tags", "popularity", "michelin", "price"]);
  });

  it("tries every wider circle with all its filters before it drops one", async () => {
    const { client } = clientFor(() => ({ results: { entities: [] } }));
    const out = await findPlaces(
      {
        destination: { ...lisbon, radiusM: 1000 },
        widen: [{ radiusM: 2500 }, { radiusM: 8500, below: 3 }],
        signals,
        tags: ["urn:tag:genre:place:restaurant:seafood"],
        popularityMax: 0.6,
        michelin: true,
        take: 5,
      },
      { client },
    );
    const used = out.calls.filter((c) => c.endpoint === "/v2/insights").map(({ params }) => [
      String(params["filter.location.radius"]),
      "filter.tags" in params,
      "filter.popularity.max" in params,
      "filter.external.exists" in params,
    ]);
    expect(used).toEqual([
      ["1000", true, true, true],
      ["2500", true, true, true],
      ["8500", true, true, true],
      ["2500", false, true, true],
      ["2500", false, false, true],
      ["2500", false, false, false],
    ]);
    expect(out.loosened).toEqual(["tags", "popularity", "michelin"]);
  });

  it("keeps a bare category past the options and the price", async () => {
    const { client, urls } = clientFor(() => ({ results: { entities: [] } }));
    const out = await findPlaces(
      {
        destination: lisbon,
        signals,
        tags: CATEGORY_FILTER_TAGS.eat,
        popularityMax: 0.6,
        michelin: true,
        priceMax: 2,
        openDay: "monday",
        take: 5,
      },
      { client },
    );
    expect(out.loosened).toEqual(["popularity", "michelin", "price", "tags"]);
    expect(urls[3].searchParams.get("filter.tags")).toBe(CATEGORY_FILTER_TAGS.eat[0]);
    expect(urls[3].searchParams.has("filter.price_level.max")).toBe(false);
    expect(urls[4].searchParams.has("filter.tags")).toBe(false);
  });

  it("finds restaurants without the Michelin filter before it gives up on restaurants", async () => {
    const { client } = clientFor((url) =>
      url.searchParams.has("filter.external.exists") || !url.searchParams.has("filter.tags")
        ? { results: { entities: [] } }
        : { results: { entities: entities(6, "restaurant") } },
    );
    const out = await findPlaces(
      { destination: lisbon, signals, tags: CATEGORY_FILTER_TAGS.eat, michelin: true, take: 5 },
      { client },
    );
    expect(out.loosened).toEqual(["michelin"]);
    expect(out.calls.filter((c) => c.endpoint === "/v2/insights")).toHaveLength(2);
    expect(out.results).toHaveLength(5);
  });

  it("says on each result what it took to reach it", async () => {
    const { client } = clientFor((url) =>
      url.searchParams.has("filter.popularity.max")
        ? { results: { entities: entities(2, "strict") } }
        : { results: { entities: entities(5, "loose") } },
    );
    const out = await findPlaces({ destination: lisbon, signals, popularityMax: 0.6, take: 5 }, { client });
    expect(out.loosened).toEqual(["popularity"]);
    expect(out.results.map((r) => r.loosened)).toEqual([undefined, undefined, ["popularity"], ["popularity"], ["popularity"]]);
  });

  it("never returns a place whose own hours say closed that day, and puts unknown hours last", async () => {
    const { properties } = template;
    const noHours = { ...properties, hours: undefined };
    const { client, urls } = clientFor(() => ({
      results: {
        entities: [
          ...entities(2, "closed"),
          ...entities(1, "unknown").map((e) => ({ ...e, properties: noHours })),
          ...entities(1, "open").map((e) => ({ ...e, properties: { ...properties, hours: { monday: [{ opens: "T18:00:00", closes: "T23:00:00" }] } } })),
        ],
      },
    }));
    const out = await findPlaces({ destination: lisbon, signals, openDay: "monday", take: 5 }, { client });
    expect(urls.at(-1)!.searchParams.has("filter.hours")).toBe(false);
    expect(out.results.map((r) => r.place.entityId)).toEqual(["open0", "unknown0"]);
    expect(out.results.map((r) => r.loosened)).toEqual([undefined, ["hours"]]);
    expect(out.loosened).toEqual(["hours"]);
  });

  it("stays under the upstream's URL limit with every signal, tag and filter and a full exclusion list", async () => {
    const id = (i: number) => `3F659C60-D199-4E55-9B72-${String(i).padStart(12, "0")}`;
    const { client, urls } = clientFor(() => ({ results: { entities: entities(6, "strict") } }));
    await findPlaces(
      {
        destination: lisbon,
        signals: Array.from({ length: MAX_SIGNALS }, (_, i) => id(i)),
        tags: ["urn:tag:genre:place:restaurant:seafood", "urn:tag:genre:place:restaurant:portuguese", "urn:tag:cuisine:qloo:mediterranean", "urn:tag:ambience:qloo:romantic"],
        tagsOperator: "union",
        excludeIds: Array.from({ length: MAX_EXCLUDED }, (_, i) => id(i + 100)),
        popularityMax: 0.6,
        michelin: true,
        priceMax: 2,
        openDay: "friday",
        take: 8,
      },
      { client },
    );
    expect(urls[0].href.length).toBeLessThan(8_000);
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
    expect(out.results.map((r) => r.place.entityId).slice(0, 3)).toEqual(["strict0", "strict1", "open0"]);
  });

  it("never comes back empty because of the open day: places with no hours fill it and say so", async () => {
    const { properties } = template;
    const { client } = clientFor(() => ({
      results: { entities: entities(5, "loose").map((e) => ({ ...e, properties: { ...properties, hours: undefined } })) },
    }));
    const out = await findPlaces({ destination: lisbon, signals, openDay: "friday", take: 5 }, { client });
    expect(out.loosened).toEqual(["hours"]);
    expect(out.results).toHaveLength(5);
  });

  describe("what /entities knows and /v2/insights does not", () => {
    const openMonday = [{ closed: false, opens: "T12:00:00", closes: "T23:00:00" }];
    const closedDay = [{ closed: true }];
    const search = (ids: string[], hours: unknown) => ({ results: { entities: ids.map((id) => ({ ...template, entity_id: id, name: id, properties: { ...template.properties, hours } })) } });
    const lookup = (rows: Record<string, Record<string, unknown>>) => (url: URL) =>
      url.pathname === "/entities"
        ? {
            success: true,
            results: (url.searchParams.get("entity_ids") ?? "").split(",").flatMap((id) => (rows[id] ? [{ ...template, entity_id: id, name: id, properties: { ...template.properties, ...rows[id] } }] : [])),
          }
        : undefined;

    it("keeps a place the search calls closed when /entities has it open", async () => {
      const rows = lookup({ a: { hours: { monday: openMonday } } });
      const { client } = clientFor((url) => rows(url) ?? search(["a"], { monday: closedDay }), true);
      const out = await findPlaces({ destination: lisbon, signals, openDay: "monday", take: 5 }, { client });
      expect(out.results.map((r) => r.place.entityId)).toEqual(["a"]);
      expect(out.loosened).toEqual([]);
    });

    it("leaves out a place the search calls open when /entities has it closed that day", async () => {
      const rows = lookup({ a: { hours: { monday: closedDay } } });
      const { client } = clientFor((url) => rows(url) ?? search(["a"], { monday: openMonday }), true);
      const out = await findPlaces({ destination: lisbon, signals, openDay: "monday", take: 5 }, { client });
      expect(out.results).toEqual([]);
    });

    it("never returns a place closed for good, with or without an open day", async () => {
      const rows = lookup({ gone: { is_closed: true, hours: {} }, here: { is_closed: false, hours: { monday: openMonday } } });
      const { client } = clientFor((url) => rows(url) ?? search(["gone", "here"], { monday: openMonday }), true);
      const plain = await findPlaces({ destination: lisbon, signals, take: 5 }, { client });
      expect(plain.results.map((r) => r.place.entityId)).toEqual(["here"]);
      const monday = await findPlaces({ destination: lisbon, signals, openDay: "monday", openSlot: "dinner", take: 5 }, { client });
      expect(monday.results.map((r) => r.place.entityId)).toEqual(["here"]);
    });

    it("falls back on the search's own hours when the lookup fails", async () => {
      const { client, urls } = clientFor((url) => (url.pathname === "/entities" ? { oops: true } : search(["shut", "open"], { monday: closedDay })), true);
      const out = await findPlaces({ destination: lisbon, signals, openDay: "monday", take: 5 }, { client });
      expect(out.results).toEqual([]);
    });
  });

  describe("open for the slot", () => {
    const spans = (...times: [string, string][]) =>
      times.map(([opens, closes]) => ({ closed: false, opens: `T${opens}:00`, closes: `T${closes}:00` }));
    const lunch = spans(["12:00", "16:00"]);
    const lunchAndDinner = spans(["12:00", "16:00"], ["19:00", "23:30"]);
    const withHours = (id: string, monday: unknown) => ({ ...template, entity_id: id, name: id, properties: { ...template.properties, hours: { monday } } });

    function slotClient(fromEntities: Record<string, unknown>, failEntities = false) {
      const entityIds: string[] = [];
      const { client, urls } = clientFor((url) => {
        if (url.pathname !== "/entities") {
          const first = spans(["12:00", "16:00"]);
          return { results: { entities: ["split", "shut", "unknown"].flatMap((p) => entities(2, p)).map((e) => ({ ...e, properties: { ...e.properties, hours: { monday: first } } })) } };
        }
        if (failEntities) return { oops: true };
        const ids = (url.searchParams.get("entity_ids") ?? "").split(",");
        entityIds.push(...ids);
        return { success: true, results: ids.flatMap((id) => (id in fromEntities ? [withHours(id, fromEntities[id])] : [])) };
      }, true);
      return { client, urls, entityIds };
    }

    const hours = { split0: lunchAndDinner, split1: lunchAndDinner, shut0: lunch, shut1: lunch };

    it("reads every span from /entities, and leaves out the places shut for the slot", async () => {
      const { client, urls } = slotClient(hours);
      const out = await findPlaces({ destination: lisbon, signals, openDay: "monday", openSlot: "dinner", take: 3 }, { client });
      expect(out.results.map((r) => r.place.entityId).sort()).toEqual(["split0", "split1", "unknown0"]);
      expect(out.results.find((r) => r.place.entityId === "split0")?.place.properties.hours).toEqual({ monday: lunchAndDinner });
      expect(urls[0]?.searchParams.get("take")).toBe("9");
    });

    it("keeps a place the lookup says nothing about, and a search whose lookup fails", async () => {
      const { client } = slotClient({}, true);
      const out = await findPlaces({ destination: lisbon, signals, openDay: "monday", openSlot: "dinner", take: 5 }, { client });
      expect(out.results).toHaveLength(5);
    });

    it("gives a place the full hours without a slot too", async () => {
      const { client, entityIds } = slotClient(hours);
      const out = await findPlaces({ destination: lisbon, signals, take: 2 }, { client });
      expect(entityIds).toHaveLength(6);
      expect(out.results[0]?.place.properties.hours).toEqual({ monday: lunchAndDinner });
    });
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

describe("openDuring", () => {
  const hours = {
    monday: [
      { closed: false, opens: "T12:00:00", closes: "T16:00:00" },
      { closed: false, opens: "T19:00:00", closes: "T23:30:00" },
    ],
    tuesday: [{ closed: false, opens: "T08:00:00", closes: "T17:00:00" }],
    wednesday: [{ closed: true }],
    thursday: [{ closed: false, opens: "T18:00:00", closes: "T02:00:00" }],
  };

  it("takes any span that reaches into the slot", () => {
    expect(openDuring(hours, "monday", "lunch")).toBe(true);
    expect(openDuring(hours, "monday", "dinner")).toBe(true);
    expect(openDuring(hours, "monday", "morning")).toBe(false);
    expect(openDuring(hours, "tuesday", "dinner")).toBe(false);
    expect(openDuring(hours, "wednesday", "dinner")).toBe(false);
  });

  it("knows breakfast", () => {
    expect(openDuring(hours, "tuesday", "breakfast")).toBe(true);
    expect(openDuring(hours, "monday", "breakfast")).toBe(false);
  });

  it("carries a span past midnight", () => {
    expect(openDuring(hours, "thursday", "night")).toBe(true);
  });

  it("does not hold unknown hours against a place, or apply to a stay", () => {
    expect(openDuring(hours, "friday", "dinner")).toBe(true);
    expect(openDuring(undefined, "friday", "dinner")).toBe(true);
    expect(openDuring({ monday: [{ opens: "soon" }] }, "monday", "dinner")).toBe(true);
    expect(openDuring(hours, "tuesday", "stay")).toBe(true);
  });
});

describe("closedOn", () => {
  it("reads closed only from the place's own hours for that day", () => {
    const hours = {
      monday: [{ opens: null, closes: null, closed: true }],
      tuesday: [{ opens: "T18:00:00", closes: "T23:00:00", closed: false }],
      friday: [],
    };
    expect(closedOn(hours, "monday")).toBe(true);
    expect(closedOn(hours, "tuesday")).toBe(false);
    expect(closedOn(hours, "friday")).toBe(false);
    expect(closedOn(hours, "sunday")).toBe(false);
    expect(closedOn(undefined, "monday")).toBe(false);
  });
});

describe("isCategoryTagFilter", () => {
  it("is true only when every tag is a category filter", () => {
    expect(isCategoryTagFilter(CATEGORY_FILTER_TAGS.drink)).toBe(true);
    expect(isCategoryTagFilter([...CATEGORY_FILTER_TAGS.eat, SEAFOOD])).toBe(false);
    expect(isCategoryTagFilter([])).toBe(false);
  });
});
