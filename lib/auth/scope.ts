import "server-only";

import { eq, inArray, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

// Who may see a row. Every owned table carries owner_id and a nullable org_id;
// a row is in scope when the caller owns it or belongs to its org. This is the
// only place that predicate is written.

export type Scope = {
  ownerId: string;
  /** Orgs the caller belongs to. Rows with one of these org_ids are in scope. */
  orgIds: readonly string[];
  /** Org stamped on rows this caller creates. Null until teams ship. */
  orgId: string | null;
};

/**
 * What a query helper accepts: a bare owner id (single user, the common case),
 * a partial scope, or the user `requireUser()` returned.
 */
export type ScopeInput =
  | string
  | { ownerId: string; orgIds?: readonly string[]; orgId?: string | null }
  | { userId: string; orgIds: readonly string[] };

export function toScope(input: ScopeInput): Scope {
  if (typeof input === "string") return { ownerId: input, orgIds: [], orgId: null };
  if ("userId" in input) return { ownerId: input.userId, orgIds: input.orgIds, orgId: null };
  return { ownerId: input.ownerId, orgIds: input.orgIds ?? [], orgId: input.orgId ?? null };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from URLs are checked before they reach a uuid column, so a bad id reads as not found. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

type OwnedColumns ={ ownerId: PgColumn; orgId: PgColumn };

/** `owner_id = $owner or org_id = any($orgs)` for one owned table. */
export function inScope(table: OwnedColumns, input: ScopeInput): SQL {
  const scope = toScope(input);
  const own = eq(table.ownerId, scope.ownerId);
  if (scope.orgIds.length === 0) return own;
  return or(own, inArray(table.orgId, [...scope.orgIds])) ?? own;
}
