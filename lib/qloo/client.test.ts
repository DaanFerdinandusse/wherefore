import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { type CacheStore, EMPTY_TTL_SECONDS, cacheKey, memoryCacheStore } from "./cache";
import { createQlooClient, stripAkas, ttlFor } from "./client";
import { QlooHttpError, QlooNetworkError, QlooNotConfiguredError, QlooParamError, QlooSchemaError } from "./errors";
import { TTL_SECONDS } from "./params";

describe("cacheKey", () => {
  it("does not collide when a value holds the separators", () => {
    const one = cacheKey("/search", [["query", "a&take=3"]]);
    const two = cacheKey("/search", [
      ["query", "a"],
      ["take", "3"],
    ]);
    expect(one).not.toBe(two);
    expect(cacheKey("/search", [["query", "a=b"]])).not.toBe(cacheKey("/search", [["query=a", "b"]]));
  });

  it("is the same whatever order the pairs come in, and differs by endpoint", () => {
    const pairs: [string, string][] = [
      ["take", "3"],
      ["query", "Lilia"],
    ];
    expect(cacheKey("/search", pairs)).toBe(cacheKey("/search", [...pairs].reverse()));
    expect(cacheKey("/search", pairs)).not.toBe(cacheKey("/v2/tags", pairs));
    expect(cacheKey("/search", pairs)).toMatch(/^qloo:[0-9a-f]{64}$/);
  });
});

const schema = z.looseObject({ results: z.array(z.looseObject({ entity_id: z.string() })) });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const status = (code: number) => new Response("upstream says no", { status: code });

function setup(responses: (() => Response | Promise<Response>)[]) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next();
  });
  const client = createQlooClient({
    apiKey: "test-key",
    baseUrl: "https://api.example.test/",
    fetch,
    store: memoryCacheStore(),
    sleep: async () => {},
  });
  return { client, fetch };
}

const params = { query: "Lilia", types: ["urn:entity:place"], take: 3 };

describe("qloo client", () => {
  it("calls the endpoint with the key header and comma-joined, sorted params", async () => {
    const { client, fetch } = setup([() => ok({ results: [{ entity_id: "A" }] })]);
    const { data, call } = await client.get("/search", params, { schema });
    expect(data.results[0].entity_id).toBe("A");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.example.test/search?query=Lilia&take=3&types=urn%3Aentity%3Aplace");
    expect(new Headers(init?.headers).get("X-Api-Key")).toBe("test-key");
    expect(call).toMatchObject({ endpoint: "/search", count: 1, cached: false });
    expect(JSON.stringify(call)).not.toContain("test-key");
  });

  it("serves the second identical request from the cache", async () => {
    const { client, fetch } = setup([() => ok({ results: [{ entity_id: "A" }, { entity_id: "B" }] })]);
    await client.get("/search", params, { schema });
    const again = await client.get("/search", { take: 3, types: "urn:entity:place", query: "Lilia" }, { schema, tripId: "t1" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(again.call).toMatchObject({ cached: true, count: 2, tripId: "t1" });
  });

  it("retries once on 5xx, then succeeds", async () => {
    const { client, fetch } = setup([() => status(503), () => ok({ results: [] })]);
    await expect(client.get("/search", params, { schema })).resolves.toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after the one retry", async () => {
    const { client, fetch } = setup([() => status(500), () => status(502)]);
    await expect(client.get("/search", params, { schema })).rejects.toMatchObject({
      name: "QlooHttpError",
      status: 502,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("never retries a 4xx", async () => {
    const { client, fetch } = setup([() => status(400), () => ok({ results: [] })]);
    await expect(client.get("/search", params, { schema })).rejects.toBeInstanceOf(QlooHttpError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a dropped connection once", async () => {
    const { client, fetch } = setup([
      () => {
        throw new TypeError("fetch failed");
      },
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    await expect(client.get("/search", params, { schema })).rejects.toBeInstanceOf(QlooNetworkError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown params before any request", async () => {
    const { client, fetch } = setup([]);
    await expect(client.get("/search", { qeury: "Lilia" }, { schema })).rejects.toBeInstanceOf(QlooParamError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails loudly when a relied-on field is missing, and does not cache it", async () => {
    const { client, fetch } = setup([() => ok({ results: [{ name: "no id" }] }), () => ok({ results: [] })]);
    await expect(client.get("/search", params, { schema })).rejects.toBeInstanceOf(QlooSchemaError);
    await client.get("/search", params, { schema });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("names the missing env variable", async () => {
    const client = createQlooClient({ apiKey: "", baseUrl: "https://x.test", store: memoryCacheStore() });
    const saved = process.env.QLOO_API_KEY;
    delete process.env.QLOO_API_KEY;
    try {
      await expect(client.get("/search", params, { schema })).rejects.toBeInstanceOf(QlooNotConfiguredError);
    } finally {
      if (saved !== undefined) process.env.QLOO_API_KEY = saved;
    }
  });

  it("shares one upstream fetch between concurrent identical requests", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { client, fetch } = setup([
      async () => {
        await gate;
        return ok({ results: [{ entity_id: "A" }] });
      },
      () => ok({ results: [{ entity_id: "B" }] }),
    ]);
    const first = client.get("/search", params, { schema, tripId: "t1" });
    const second = client.get("/search", { ...params }, { schema, tripId: "t2" });
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a.data).toEqual(b.data);
    expect(a.call).toMatchObject({ cached: false, tripId: "t1" });
    expect(b.call).toMatchObject({ cached: true, tripId: "t2" });
  });

  it("passes a shared failure to every joined caller, then lets the next one retry", async () => {
    const { client, fetch } = setup([() => status(400), () => ok({ results: [] })]);
    const both = await Promise.allSettled([client.get("/search", params, { schema }), client.get("/search", params, { schema })]);
    expect(both.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(client.get("/search", params, { schema })).resolves.toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps an empty answer for a minute, not the endpoint's TTL", async () => {
    const sets: { key: string; ttlSeconds: number }[] = [];
    const store = memoryCacheStore();
    const spy: CacheStore = { get: (key) => store.get(key), set: async (entry) => {
      sets.push({ key: entry.key, ttlSeconds: entry.ttlSeconds });
      await store.set(entry);
    } };
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
      String(input).includes("filter.type")
        ? ok({ results: { entities: [] } })
        : ok({ results: [{ entity_id: "A" }] }),
    );
    const client = createQlooClient({ apiKey: "k", baseUrl: "https://api.example.test", fetch, store: spy });
    const insights = z.looseObject({ results: z.looseObject({ entities: z.array(z.unknown()) }) });
    await client.get("/v2/insights", { "filter.type": "urn:entity:place", take: 5 }, { schema: insights });
    await client.get("/search", params, { schema });
    expect(sets.map((s) => s.ttlSeconds)).toEqual([EMPTY_TTL_SECONDS, TTL_SECONDS["/search"]]);
    expect(ttlFor("/v2/insights", { results: { entities: [] } })).toBe(60);
    expect(ttlFor("/v2/insights", { results: { entities: [{}] } })).toBe(TTL_SECONDS["/v2/insights"]);
    expect(ttlFor("/v2/insights", { results: { entities: [] } }, 30)).toBe(30);
  });

  it("strips translated names before caching", () => {
    expect(stripAkas({ a: [{ akas: [1], b: { akas: 2, c: 3 } }] })).toEqual({ a: [{ b: { c: 3 } }] });
  });
});
