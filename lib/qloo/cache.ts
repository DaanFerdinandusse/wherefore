// Response cache for the recommendation client. Cold combinations upstream take
// 8 to 10 s, so every answer is kept in api_cache for its endpoint's TTL.
// The store is an interface so tests (and scripts without a database) can run
// on the in-memory one; the default is the Postgres table.

import { createHash } from "node:crypto";

import type { QlooEndpoint } from "./params";

export interface CacheStore {
  /** The cached body, or undefined when absent or expired. */
  get(key: string): Promise<unknown | undefined>;
  set(entry: { key: string; endpoint: QlooEndpoint; body: unknown; ttlSeconds: number }): Promise<void>;
}

/**
 * Stable key for a request: sha256 over the endpoint and its sorted, serialized
 * params. The pairs must come from serializeParams (already sorted), so the same
 * request always lands on the same row whatever order the caller wrote it in.
 */
export function cacheKey(endpoint: QlooEndpoint, pairs: readonly [string, string][]): string {
  const sorted = [...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonical = `${endpoint}?${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`;
  return `qloo:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function memoryCacheStore(now: () => number = Date.now): CacheStore {
  const rows = new Map<string, { body: unknown; expiresAt: number }>();
  return {
    async get(key) {
      const row = rows.get(key);
      if (!row) return undefined;
      if (row.expiresAt <= now()) {
        rows.delete(key);
        return undefined;
      }
      return row.body;
    },
    async set({ key, body, ttlSeconds }) {
      rows.set(key, { body, expiresAt: now() + ttlSeconds * 1000 });
    },
  };
}

/** The api_cache table. The db module is imported on first use so pure tests
 *  and scripts that pass their own store never need DATABASE_URL. */
export function dbCacheStore(): CacheStore {
  return {
    async get(key) {
      const { db, apiCache, and, eq, gt } = await loadDb();
      const rows = await db
        .select({ body: apiCache.body })
        .from(apiCache)
        .where(and(eq(apiCache.key, key), gt(apiCache.expiresAt, new Date())))
        .limit(1);
      return rows[0]?.body;
    },
    async set({ key, endpoint, body, ttlSeconds }) {
      const { db, apiCache } = await loadDb();
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await db
        .insert(apiCache)
        .values({ key, endpoint, body, expiresAt })
        .onConflictDoUpdate({ target: apiCache.key, set: { endpoint, body, expiresAt, createdAt: new Date() } });
    },
  };
}

async function loadDb() {
  const [{ db }, { apiCache }, { and, eq, gt }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/schema/cache"),
    import("drizzle-orm"),
  ]);
  return { db, apiCache, and, eq, gt };
}
