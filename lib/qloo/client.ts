import "server-only";

// The one door to the recommendation API. Every request goes through `get`:
// params validated against the endpoint allowlist, answer cached in api_cache,
// one retry on 5xx, none on 4xx, and a call record for the "How we got this"
// panel. Requests share a small concurrency gate because parallel paging runs
// into rate limits upstream (empty pages, no error).

import type { z } from "zod";

import { type CacheStore, EMPTY_TTL_SECONDS, cacheKey, dbCacheStore, memoryCacheStore } from "./cache";
import type { QlooCall } from "./contracts";
import { QlooHttpError, QlooNetworkError, QlooNotConfiguredError, QlooSchemaError } from "./errors";
import { type QlooEndpoint, type QlooParams, TTL_SECONDS, paramsForLog, serializeParams, toQueryString } from "./params";

export type GetOptions<T> = {
  schema: z.ZodType<T>;
  /** Defaults to the endpoint's TTL (insights 24 h, search and tags 7 d, entities 30 d). */
  ttlSeconds?: number;
  tripId?: string;
};

export type GetResult<T> = { data: T; call: QlooCall };

export interface QlooClient {
  get<T>(endpoint: QlooEndpoint, params: QlooParams, options: GetOptions<T>): Promise<GetResult<T>>;
}

export type QlooClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  store?: CacheStore;
  sleep?: (ms: number) => Promise<void>;
  /** Requests in flight at once. Bulk callers should still go sequentially. */
  maxConcurrent?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_DELAY_MS = 400;

export function createQlooClient(options: QlooClientOptions = {}): QlooClient {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const store = options.store ?? memoryCacheStore();
  const gate = createGate(options.maxConcurrent ?? 2);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  function config() {
    const apiKey = options.apiKey ?? process.env.QLOO_API_KEY;
    const baseUrl = options.baseUrl ?? process.env.QLOO_API_URL;
    if (!apiKey) throw new QlooNotConfiguredError("QLOO_API_KEY");
    if (!baseUrl) throw new QlooNotConfiguredError("QLOO_API_URL");
    return { apiKey, baseUrl: baseUrl.replace(/\/+$/, "") };
  }

  async function fetchJson(endpoint: QlooEndpoint, query: string): Promise<unknown> {
    const { apiKey, baseUrl } = config();
    const url = `${baseUrl}${endpoint}?${query}`;
    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt === 0;
      let response: Response;
      try {
        response = await gate(() =>
          doFetch(url, {
            headers: { "X-Api-Key": apiKey, Accept: "application/json" },
            signal: AbortSignal.timeout(timeoutMs),
          }),
        );
      } catch (error) {
        // A timeout already waited long enough; only a dropped connection retries.
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        if (canRetry && !timedOut) {
          await sleep(retryDelayMs);
          continue;
        }
        throw new QlooNetworkError(endpoint, error);
      }
      if (response.ok) return response.json();
      const body = await response.text().catch(() => "");
      if (response.status >= 500 && canRetry) {
        await sleep(retryDelayMs);
        continue;
      }
      throw new QlooHttpError(endpoint, response.status, body);
    }
  }

  // Concurrent requests for the same key share one cache read and at most one
  // upstream fetch (within this instance; other instances still meet at the
  // cache table).
  const inflight = new Map<string, Promise<unknown>>();

  async function load<T>(
    endpoint: QlooEndpoint,
    key: string,
    pairs: [string, string][],
    options: GetOptions<T>,
  ): Promise<{ body: unknown; data: T; cached: boolean }> {
    const hit = await store.get(key).catch((error: unknown) => {
      console.warn(`[qloo] cache read failed for ${endpoint}`, error);
      return undefined;
    });
    if (hit !== undefined) {
      const parsed = options.schema.safeParse(hit);
      if (parsed.success) return { body: hit, data: parsed.data, cached: true };
      // A row written under an older schema: refetch and overwrite it.
    }

    const body = stripAkas(await fetchJson(endpoint, toQueryString(pairs)));
    const parsed = options.schema.safeParse(body);
    if (!parsed.success) throw new QlooSchemaError(endpoint, summarizeIssues(parsed.error));

    await store
      .set({ key, endpoint, body, ttlSeconds: ttlFor(endpoint, body, options.ttlSeconds) })
      .catch((error: unknown) => console.warn(`[qloo] cache write failed for ${endpoint}`, error));
    return { body, data: parsed.data, cached: false };
  }

  return {
    async get<T>(endpoint: QlooEndpoint, params: QlooParams, options: GetOptions<T>): Promise<GetResult<T>> {
      const pairs = serializeParams(endpoint, params);
      const key = cacheKey(endpoint, pairs);
      const started = performance.now();
      const record = (body: unknown, cached: boolean): QlooCall => ({
        endpoint,
        params: paramsForLog(pairs),
        count: countResults(body),
        ms: Math.round(performance.now() - started),
        cached,
        ...(options.tripId ? { tripId: options.tripId } : {}),
      });

      const shared = inflight.get(key);
      if (shared) {
        // Joined another caller's request: parse with this caller's schema and
        // log it as cached, since it cost no request of its own.
        const body = await shared;
        const parsed = options.schema.safeParse(body);
        if (!parsed.success) throw new QlooSchemaError(endpoint, summarizeIssues(parsed.error));
        return { data: parsed.data, call: record(body, true) };
      }

      const pending = load(endpoint, key, pairs, options);
      const body = pending.then((loaded) => loaded.body);
      // Joiners see a failure through their own await; this only keeps a
      // failure nobody joined from surfacing as an unhandled rejection.
      body.catch(() => {});
      inflight.set(key, body);
      try {
        const loaded = await pending;
        return { data: loaded.data, call: record(loaded.body, loaded.cached) };
      } finally {
        inflight.delete(key);
      }
    },
  };
}

let defaultClient: QlooClient | undefined;

/** The app's client: env key, api_cache table (memory when there is no database). */
export function getQlooClient(): QlooClient {
  defaultClient ??= createQlooClient({
    store: process.env.DATABASE_URL ? dbCacheStore() : memoryCacheStore(),
  });
  return defaultClient;
}

/** `getQlooClient().get(...)`: validated, cached, retried once on 5xx. */
export function qlooGet<T>(endpoint: QlooEndpoint, params: QlooParams, options: GetOptions<T>): Promise<GetResult<T>> {
  return getQlooClient().get(endpoint, params, options);
}

/** The endpoint's TTL (or the caller's), cut to a minute for an empty answer. */
export function ttlFor(endpoint: QlooEndpoint, body: unknown, ttlSeconds?: number): number {
  const ttl = ttlSeconds ?? TTL_SECONDS[endpoint];
  return countResults(body) === 0 ? Math.min(ttl, EMPTY_TTL_SECONDS) : ttl;
}

/** Result count of any response shape the client reads. */
export function countResults(body: unknown): number {
  if (!isRecord(body)) return 0;
  const results = body.results;
  if (Array.isArray(results)) return results.length;
  if (isRecord(results)) {
    for (const value of Object.values(results)) if (Array.isArray(value)) return value.length;
  }
  return 0;
}

/** Drops `akas` (translated names in 60 languages) everywhere: never read, and
 *  about a third of a cached body. */
export function stripAkas(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripAkas);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== "akas") out[key] = stripAkas(child);
  }
  return out;
}

function summarizeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** At most `limit` tasks in flight; the rest wait in order. */
function createGate(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    // A finishing task hands its slot straight to the next waiter, so a newcomer
    // cannot slip in between and push the count over the limit.
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
