import { describe, expect, it } from "vitest";

import { cacheKey, memoryCacheStore } from "./cache";
import { QlooParamError } from "./errors";
import { paramsForLog, point, serializeParams, toQueryString } from "./params";

describe("serializeParams", () => {
  it("throws on a param that is not on the endpoint's allowlist", () => {
    // The upstream would answer 200 with a generic list for this typo.
    expect(() => serializeParams("/v2/insights", { "filter.tagz": "urn:tag:x" })).toThrow(QlooParamError);
    expect(() => serializeParams("/search", { "feature.explainability": true })).toThrow(/not an allowed param/);
  });

  it("refuses filter.location.query on insights (the geocoder picks the wrong city)", () => {
    expect(() => serializeParams("/v2/insights", { "filter.location.query": "Copenhagen" })).toThrow(QlooParamError);
  });

  it("joins arrays with commas, sorts keys and drops undefined", () => {
    const pairs = serializeParams("/v2/insights", {
      take: 10,
      "signal.interests.entities": ["A", "B", "C"],
      "filter.type": "urn:entity:place",
      "filter.tags": undefined,
      "feature.explainability": true,
    });
    expect(pairs).toEqual([
      ["feature.explainability", "true"],
      ["filter.type", "urn:entity:place"],
      ["signal.interests.entities", "A,B,C"],
      ["take", "10"],
    ]);
  });

  it("validates value shapes", () => {
    expect(() => serializeParams("/v2/insights", { take: 51 })).toThrow(/between 1 and 50/);
    expect(() => serializeParams("/v2/insights", { take: 2.5 })).toThrow(/integer/);
    expect(() => serializeParams("/v2/insights", { "filter.location": "38.7,-9.1" })).toThrow(/POINT/);
    expect(() => serializeParams("/search", { "filter.location": "POINT(-9.1 38.7)" })).toThrow(/lat,lon/);
    expect(() => serializeParams("/v2/insights", { "signal.interests.entities": [] })).toThrow(/non-empty list/);
    expect(() => serializeParams("/v2/insights", { "signal.interests.entities": ["A,B"] })).toThrow(/without commas/);
    expect(() => serializeParams("/v2/insights", { "operator.filter.tags": "or" })).toThrow(/union, intersection/);
    expect(() => serializeParams("/v2/insights", { "filter.type": "place" })).toThrow(/urn/);
    expect(() => serializeParams("/v2/insights", { "feature.explainability": "true" })).toThrow(/boolean/);
  });

  it("builds POINT longitude first", () => {
    expect(point(38.7426741, -9.1561145)).toBe("POINT(-9.15611 38.74267)");
    expect(serializeParams("/v2/insights", { "filter.location": point(38.74, -9.15) })).toEqual([
      ["filter.location", "POINT(-9.15 38.74)"],
    ]);
  });

  it("encodes values for the URL", () => {
    expect(toQueryString([["query", "Death & Co"], ["take", "3"]])).toBe("query=Death%20%26%20Co&take=3");
  });
});

describe("paramsForLog", () => {
  it("cuts id lists to 10 and never carries more", () => {
    const ids = Array.from({ length: 14 }, (_, i) => `ID${i}`);
    const logged = paramsForLog(serializeParams("/v2/insights", { "signal.interests.entities": ids, take: 5 }));
    expect(logged["signal.interests.entities"]).toEqual([...ids.slice(0, 10), "+4 more"]);
    expect(logged.take).toBe("5");
  });
});

describe("cacheKey", () => {
  it("is the same whatever order the params were written in", () => {
    const a = serializeParams("/v2/insights", { take: 10, "filter.type": "urn:entity:place" });
    const b = serializeParams("/v2/insights", { "filter.type": "urn:entity:place", take: 10 });
    expect(cacheKey("/v2/insights", a)).toBe(cacheKey("/v2/insights", b));
    expect(cacheKey("/v2/insights", [...a].reverse())).toBe(cacheKey("/v2/insights", a));
  });

  it("differs by endpoint and by value, and treats array and joined string alike", () => {
    const base = serializeParams("/v2/insights", { take: 10 });
    expect(cacheKey("/v2/insights", base)).not.toBe(cacheKey("/search", base));
    expect(cacheKey("/v2/insights", base)).not.toBe(cacheKey("/v2/insights", serializeParams("/v2/insights", { take: 11 })));
    const list = serializeParams("/entities", { entity_ids: ["A", "B"] });
    const joined = serializeParams("/entities", { entity_ids: "A,B" });
    expect(cacheKey("/entities", list)).toBe(cacheKey("/entities", joined));
    expect(cacheKey("/entities", list)).toMatch(/^qloo:[0-9a-f]{64}$/);
  });
});

describe("memoryCacheStore", () => {
  it("expires entries after their TTL", async () => {
    let now = 0;
    const store = memoryCacheStore(() => now);
    await store.set({ key: "k", endpoint: "/search", body: { ok: 1 }, ttlSeconds: 60 });
    expect(await store.get("k")).toEqual({ ok: 1 });
    now = 61_000;
    expect(await store.get("k")).toBeUndefined();
  });
});
