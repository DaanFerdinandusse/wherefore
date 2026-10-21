import "server-only";

import { and, desc, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { inScope, type ScopeInput } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { advisorPlaces, clients, trips } from "@/lib/db/schema";

// Fuzzy search over the plain `search` columns (pg_trgm, GIN indexed).
//
// A row matches when the column contains the query as a substring, when the
// whole strings are similar (`%`, threshold 0.3), or when the query is close
// to some stretch of the column (word_similarity >= WORD_THRESHOLD). The last
// clause is what lets "Anna Ruis" find "Ana Ruiz": its word similarity is
// about 0.55, under pg_trgm's default 0.6 for `<%`, so the threshold is
// written out instead of using the operator. Results are owner-scoped first,
// so the unindexed clause only ever scans one advisor's rows.

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

/** The match predicate for one text column. */
export function trgmMatch(column: PgColumn | SQL, q: string): SQL {
  const like = `%${escapeLike(q)}%`;
  return sql`(${column} ilike ${like} or ${column} % ${q} or word_similarity(${q}, ${column}) >= ${WORD_THRESHOLD})`;
}

/** Best match first. */
export function trgmRank(column: PgColumn | SQL, q: string): SQL {
  return sql`word_similarity(${q}, ${column})`;
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
  const rows = await db
    .select()
    .from(owned)
    .where(and(inScope(owned, scope), trgmMatch(owned.search, query)))
    .orderBy(desc(trgmRank(owned.search, query)), desc(owned.updatedAt))
    .limit(limit);
  return rows as unknown as T["$inferSelect"][];
}
