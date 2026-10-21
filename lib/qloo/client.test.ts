import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { memoryCacheStore } from "./cache";
import { createQlooClient, stripAkas } from "./client";
import { QlooHttpError, QlooNetworkError, QlooNotConfiguredError, QlooParamError, QlooSchemaError } from "./errors";

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

  it("strips translated names before caching", () => {
    expect(stripAkas({ a: [{ akas: [1], b: { akas: 2, c: 3 } }] })).toEqual({ a: [{ b: { c: 3 } }] });
  });
});
