import "server-only";

import { and, desc, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { PgColumn } from "drizzle-orm/pg-core";

import { inScope, type ScopeInput } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { advisorPlaces, clients, trips } from "@/lib/db/schema";

// Fuzzy search over the plain `search` columns (pg_trgm, GIN indexed).
//
// A row matches when the column contains the query as a substring (`ilike`),
// when the whole strings are similar (`%`, pg_trgm's similarity threshold,
// 0.3), or when the query is close to some stretch of the column (`<%`, word
// similarity). All three operators are served by the gin_trgm_ops index, so
// the planner can answer the whole predicate from it (a BitmapOr of index
// scans) instead of scanning the advisor's rows.
//
// `<%` reads its threshold from `pg_trgm.word_similarity_threshold`, default
// 0.6. "Anna Ruis" against "Ana Ruiz ..." scores about 0.55, so the queries
// here lower it to WORD_THRESHOLD with `set_config(..., true)` in the same
// db.batch (one transaction over HTTP): the setting lives exactly as long as
// that transaction. `withTrgmThreshold` does that for any query.

export const WORD_THRESHOLD = 0.45;
export const MIN_QUERY_LENGTH = 2;

/** Escape LIKE wildcards so a typed `%` or `_` matches itself. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Collapse whitespace and trim; null when too short to search. */
export function normalizeQuery(q: string | null | undefined): string | null {
  const clean = (q ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  return clean.length >= MIN_QUERY_LENGTH ? clean : null;
}

/**
 * The match predicate for one text column. Every branch is index supported.
 * Run it through `withTrgmThreshold` so `<%` uses WORD_THRESHOLD, not 0.6.
 */
export function trgmMatch(column: PgColumn | SQL, q: string): SQL {
  const like = `%${escapeLike(q)}%`;
  return sql`(${column} ilike ${like} or ${column} % ${q} or ${q} <% ${column})`;
}

/** Best match first. */
export function trgmRank(column: PgColumn | SQL, q: string): SQL {
  return sql`word_similarity(${q}, ${column})`;
}

/** Sets the word similarity threshold for the rest of the current transaction. */
export function setWordThreshold() {
  return db.execute(
    sql`select set_config('pg_trgm.word_similarity_threshold', ${String(WORD_THRESHOLD)}, true)`,
  );
}

/** Runs `query` in one transaction after lowering the word similarity threshold. */
export async function withTrgmThreshold<Q extends BatchItem<"pg">>(query: Q): Promise<Q["_"]["result"]> {
  const [, rows] = await db.batch([setWordThreshold(), query]);
  return rows;
}

/** The owned tables that carry a `search` column. */
export type SearchTable = typeof clients | typeof trips | typeof advisorPlaces;

/**
 * Rows of one owned table whose `search` column matches `q`, best first.
 * Returns [] for a query under two characters.
 */
export async function searchRows<T extends SearchTable>(
  table: T,
  scope: ScopeInput,
  q: string,
  limit = 8,
): Promise<T["$inferSelect"][]> {
  const query = normalizeQuery(q);
  if (!query) return [];
  // The three tables share the owned + search columns; drizzle cannot infer a
  // select over a union of tables, so the result is narrowed back to T's row.
  const owned = table as typeof clients;
  const rows = await withTrgmThreshold(
    db
      .select()
      .from(owned)
      .where(and(inScope(owned, scope), trgmMatch(owned.search, query)))
      .orderBy(desc(trgmRank(owned.search, query)), desc(owned.updatedAt))
      .limit(limit),
  );
  return rows as unknown as T["$inferSelect"][];
}
