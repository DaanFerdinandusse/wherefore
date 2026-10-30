// Param allowlists per endpoint. The upstream answers HTTP 200 with a generic,
// signal-free list when it does not recognise a param, so a typo here would
// quietly ruin every card. Only params that were tested live
// (QLOO_API_FINDINGS.md) are on the list; adding one means testing it first.

import { QlooParamError } from "./errors";

export type QlooEndpoint = "/search" | "/v2/insights" | "/v2/tags" | "/entities";

export type ParamValue = string | number | boolean | readonly string[];
export type QlooParams = Readonly<Record<string, ParamValue | undefined>>;

type ParamSpec =
  | { kind: "string" }
  | { kind: "urn" }
  | { kind: "list" }
  | { kind: "bool" }
  | { kind: "int"; min: number; max: number }
  | { kind: "number"; min: number; max: number }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "point" }
  | { kind: "latlon" };

const take: ParamSpec = { kind: "int", min: 1, max: 50 };
const page: ParamSpec = { kind: "int", min: 1, max: 200 };

export const PARAM_ALLOWLIST: Record<QlooEndpoint, Record<string, ParamSpec>> = {
  "/search": {
    query: { kind: "string" },
    types: { kind: "list" },
    take,
    page,
    // "lat,lon". Biases fuzzy search to a city (Le Bernardin without it ranked a
    // brasserie in Le Havre first).
    "filter.location": { kind: "latlon" },
  },
  "/v2/insights": {
    "filter.type": { kind: "urn" },
    // Always POINT(lon lat): filter.location.query picks the wrong city for
    // ambiguous names, so it is deliberately not on this list.
    "filter.location": { kind: "point" },
    "filter.location.radius": { kind: "int", min: 100, max: 100_000 },
    "filter.tags": { kind: "list" },
    "operator.filter.tags": { kind: "enum", values: ["union", "intersection"] },
    "filter.price_level.max": { kind: "int", min: 1, max: 4 },
    "filter.price_level.min": { kind: "int", min: 1, max: 4 },
    // A 0 to 1 percentile, read at the top level of each entity.
    "filter.popularity.max": { kind: "number", min: 0, max: 1 },
    // Only Michelin is on the list: it is the only key tested live.
    "filter.external.exists": { kind: "enum", values: ["michelin"] },
    "filter.exclude.entities": { kind: "list" },
    "filter.results.entities": { kind: "list" },
    "filter.tag.types": { kind: "list" },
    "filter.geocode.country_code": { kind: "string" },
    "signal.interests.entities": { kind: "list" },
    "signal.interests.tags": { kind: "list" },
    "feature.explainability": { kind: "bool" },
    "bias.trends": { kind: "enum", values: ["low", "medium", "high"] },
    take,
    page,
  },
  "/v2/tags": {
    "filter.query": { kind: "string" },
    "filter.parents.types": { kind: "list" },
    take,
    page,
  },
  "/entities": {
    entity_ids: { kind: "list" },
  },
};

/** How long a response stays fresh in api_cache, per endpoint. */
export const TTL_SECONDS: Record<QlooEndpoint, number> = {
  "/v2/insights": 24 * 60 * 60,
  "/search": 7 * 24 * 60 * 60,
  "/v2/tags": 7 * 24 * 60 * 60,
  "/entities": 30 * 24 * 60 * 60,
};

/** Params whose lists can be long (entity ids). Trimmed in the calls log. */
const ID_LIST_PARAMS = new Set([
  "signal.interests.entities",
  "filter.results.entities",
  "filter.exclude.entities",
  "entity_ids",
]);
const LOGGED_IDS = 10;

const POINT_RE = /^POINT\(-?\d{1,3}(\.\d+)? -?\d{1,2}(\.\d+)?\)$/;
const LATLON_RE = /^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

function fail(endpoint: string, key: string, reason: string): never {
  throw new QlooParamError(endpoint, key, reason);
}

function serializeValue(endpoint: string, key: string, spec: ParamSpec, value: ParamValue): string {
  switch (spec.kind) {
    case "string": {
      if (typeof value !== "string" || value.trim() === "") fail(endpoint, key, "must be a non-empty string");
      return value;
    }
    case "urn": {
      if (typeof value !== "string" || !value.startsWith("urn:")) fail(endpoint, key, "must be a urn");
      return value;
    }
    case "list": {
      const items = typeof value === "string" ? value.split(",") : value;
      if (!Array.isArray(items) || items.length === 0) fail(endpoint, key, "must be a non-empty list");
      const clean = (items as readonly unknown[]).map((item) => {
        if (typeof item !== "string" || item.trim() === "" || item.includes(",")) {
          fail(endpoint, key, "must hold non-empty strings without commas");
        }
        return item.trim();
      });
      return clean.join(",");
    }
    case "bool": {
      if (typeof value !== "boolean") fail(endpoint, key, "must be a boolean");
      return value ? "true" : "false";
    }
    case "int": {
      if (typeof value !== "number" || !Number.isInteger(value)) fail(endpoint, key, "must be an integer");
      if (value < spec.min || value > spec.max) fail(endpoint, key, `must be between ${spec.min} and ${spec.max}`);
      return String(value);
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) fail(endpoint, key, "must be a number");
      if (value < spec.min || value > spec.max) fail(endpoint, key, `must be between ${spec.min} and ${spec.max}`);
      return String(value);
    }
    case "enum": {
      if (typeof value !== "string" || !spec.values.includes(value)) {
        fail(endpoint, key, `must be one of ${spec.values.join(", ")}`);
      }
      return value;
    }
    case "point": {
      if (typeof value !== "string" || !POINT_RE.test(value)) fail(endpoint, key, "must be POINT(lon lat)");
      return value;
    }
    case "latlon": {
      if (typeof value !== "string" || !LATLON_RE.test(value)) fail(endpoint, key, "must be lat,lon");
      return value;
    }
  }
}

/**
 * Validates params against the endpoint's allowlist and serializes them into
 * sorted [key, value] pairs (arrays comma-joined, undefined dropped). Sorted so
 * the cache key and the URL are stable.
 * @throws QlooParamError on an unknown key or a bad value.
 */
export function serializeParams(endpoint: QlooEndpoint, params: QlooParams): [string, string][] {
  const allowed = PARAM_ALLOWLIST[endpoint];
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const spec = allowed[key];
    if (!spec) fail(endpoint, key, "is not an allowed param");
    pairs.push([key, serializeValue(endpoint, key, spec, value)]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return pairs;
}

export function toQueryString(pairs: readonly [string, string][]): string {
  return pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}

/** Builds POINT(lon lat), longitude first, with 5 decimals (about 1 m). */
export function point(lat: number, lon: number): string {
  return `POINT(${round5(lon)} ${round5(lat)})`;
}

export function latLon(lat: number, lon: number): string {
  return `${round5(lat)},${round5(lon)}`;
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/** The params as the "How we got this" panel shows them: id lists cut to 10. */
export function paramsForLog(pairs: readonly [string, string][]): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of pairs) {
    if (!ID_LIST_PARAMS.has(key)) {
      out[key] = value;
      continue;
    }
    const ids = value.split(",");
    out[key] = ids.length > LOGGED_IDS ? [...ids.slice(0, LOGGED_IDS), `+${ids.length - LOGGED_IDS} more`] : ids;
  }
  return out;
}
