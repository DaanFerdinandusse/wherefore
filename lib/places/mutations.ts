import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, getTableColumns, inArray, isNull, sql, type SQL } from "drizzle-orm";

import { NotFoundError } from "@/lib/auth/errors";
import { inScope, isUuid, toScope, type ScopeInput } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { advisorPlaces, places, tripPlaces, trips } from "@/lib/db/schema";

import type {
  AdvisorPlace,
  PlaceUpsert,
  RemoveAdvisorPlace,
  SaveAdvisorPlace,
  UpdateAdvisorPlaceNote,
  UpsertPlaces,
} from "./contracts";
import { getAdvisorPlaceForPlace, getPlace } from "./queries";

// Place cache writes and My places writes. advisor_places.place_name and
// search are maintained here: every write ends with refreshAdvisorPlaceSearch
// in the same batch.

type PlaceKey = keyof PlaceUpsert;
const placeColumns = getTableColumns(places);
// Never rewritten on refresh: the key, the row id and its birth time.
const FIXED_KEYS = new Set<PlaceKey>(["id", "entityId", "createdAt", "updatedAt"]);

/** Merge rows that share an entity id; defined fields of later rows win. */
export function mergePlaceRows(rows: PlaceUpsert[]): PlaceUpsert[] {
  const byEntity = new Map<string, PlaceUpsert>();
  for (const row of rows) {
    const defined = Object.fromEntries(
      Object.entries(row).filter(([, value]) => value !== undefined),
    ) as PlaceUpsert;
    const previous = byEntity.get(row.entityId);
    byEntity.set(row.entityId, previous ? { ...previous, ...defined } : defined);
  }
  return [...byEntity.values()];
}

export const upsertPlaces: UpsertPlaces = async (rows) => {
  const merged = mergePlaceRows(rows).map((row) => {
    const copy = { ...row };
    delete copy.id;
    return copy;
  });
  if (merged.length === 0) return {};

  // One upsert per set of supplied fields, all in one batch. Each statement
  // refreshes only the columns its rows carry, so a row without `images`
  // never resets another row's images. A nullable column the new data leaves
  // null keeps what we had (a search hit has fewer fields than an entities
  // lookup).
  const statements = groupByFields(merged).map((group) =>
    db
      .insert(places)
      .values(group.rows)
      .onConflictDoUpdate({ target: places.entityId, set: refreshSet(group.keys) })
      .returning({ id: places.id, entityId: places.entityId }),
  );
  const [first, ...rest] = statements;
  if (!first) return {};
  const results = await db.batch([first, ...rest]);
  return Object.fromEntries(results.flat().map((row) => [row.entityId, row.id]));
};

/** Rows grouped by the exact set of fields they define, in first-seen order. */
export function groupByFields(rows: PlaceUpsert[]): { keys: PlaceKey[]; rows: PlaceUpsert[] }[] {
  const groups = new Map<string, { keys: PlaceKey[]; rows: PlaceUpsert[] }>();
  for (const row of rows) {
    const keys = (Object.keys(row) as PlaceKey[]).filter((key) => row[key] !== undefined).sort();
    const id = keys.join(",");
    const group = groups.get(id) ?? { keys, rows: [] };
    group.rows.push(row);
    groups.set(id, group);
  }
  return [...groups.values()];
}

function refreshSet(keys: PlaceKey[]): Record<string, SQL> {
  const set: Record<string, SQL> = { updatedAt: sql`now()` };
  for (const key of keys) {
    if (FIXED_KEYS.has(key)) continue;
    const column = placeColumns[key];
    const incoming = sql`excluded.${sql.identifier(column.name)}`;
    set[key] = column.notNull ? incoming : sql`coalesce(${incoming}, ${column})`;
  }
  if (!keys.includes("fetchedAt")) set.fetchedAt = sql`now()`;
  return set;
}

/** advisor_places.search = place name + city + note. */
export function refreshAdvisorPlaceSearch(where: SQL) {
  return db
    .update(advisorPlaces)
    .set({
      search: sql`concat_ws(' ', ${advisorPlaces.placeName}, ${advisorPlaces.city}, nullif(${advisorPlaces.note}, ''))`,
    })
    .where(where)
    .returning();
}

function single(rows: AdvisorPlace[]): AdvisorPlace {
  const row = rows[0];
  if (!row) throw new NotFoundError("saved place");
  return row;
}

export const saveAdvisorPlace: SaveAdvisorPlace = async (ownerId, input) => {
  const place = await getPlace(input.placeId);
  if (!place) throw new NotFoundError("place");
  const scope = toScope(ownerId);
  const city = (input.city ?? place.city ?? "").trim();
  const note = input.note?.trim();

  const [, refreshed] = await db.batch([
    db
      .insert(advisorPlaces)
      .values({
        id: randomUUID(),
        ownerId: scope.ownerId,
        orgId: scope.orgId,
        placeId: place.id,
        city,
        note: note ?? "",
        tags: input.tags ?? [],
        placeName: place.name,
      })
      .onConflictDoUpdate({
        target: [advisorPlaces.ownerId, advisorPlaces.placeId],
        set: {
          city,
          placeName: place.name,
          ...(note !== undefined ? { note } : {}),
          ...(input.tags ? { tags: input.tags } : {}),
          updatedAt: sql`now()`,
        },
      }),
    refreshAdvisorPlaceSearch(
      and(eq(advisorPlaces.ownerId, scope.ownerId), eq(advisorPlaces.placeId, place.id)) as SQL,
    ),
  ]);
  return single(refreshed);
};

export const updateAdvisorPlaceNote: UpdateAdvisorPlaceNote = async (id, note, scope) => {
  if (!isUuid(id)) throw new NotFoundError("saved place");
  const where = and(eq(advisorPlaces.id, id), inScope(advisorPlaces, scope)) as SQL;
  const [, refreshed] = await db.batch([
    db.update(advisorPlaces).set({ note: note.trim(), updatedAt: sql`now()` }).where(where),
    refreshAdvisorPlaceSearch(where),
  ]);
  return single(refreshed);
};

export const removeAdvisorPlace: RemoveAdvisorPlace = async (id, scope) => {
  if (!isUuid(id)) throw new NotFoundError("saved place");
  const rows = await db
    .delete(advisorPlaces)
    .where(and(eq(advisorPlaces.id, id), inScope(advisorPlaces, scope)))
    .returning({ id: advisorPlaces.id });
  if (rows.length === 0) throw new NotFoundError("saved place");
};

/** What a removal hands back so "Undo" can put the row back as it was. */
export type RemovedAdvisorPlace = {
  id: string;
  placeId: string;
  city: string;
  note: string;
  tags: string[];
  savedAt: string;
  lastUsedAt: string | null;
  /** trip_places that pointed at the row ("Your place" on those trips). */
  tripPlaceIds: string[];
};

/**
 * Remove a saved place and return what undo needs: the row and the trip
 * places that pointed at it (the foreign key nulls them on delete). One
 * transaction, so the list of links matches the row that was removed.
 */
export async function takeAdvisorPlace(id: string, scope: ScopeInput): Promise<RemovedAdvisorPlace> {
  if (!isUuid(id)) throw new NotFoundError("saved place");
  const where = and(eq(advisorPlaces.id, id), inScope(advisorPlaces, scope)) as SQL;
  const [links, removed] = await db.batch([
    db
      .select({ id: tripPlaces.id })
      .from(tripPlaces)
      .innerJoin(advisorPlaces, eq(advisorPlaces.id, tripPlaces.advisorPlaceId))
      .where(where),
    db.delete(advisorPlaces).where(where).returning(),
  ]);
  const row = removed[0];
  if (!row) throw new NotFoundError("saved place");
  return {
    id: row.id,
    placeId: row.placeId,
    city: row.city,
    note: row.note,
    tags: row.tags,
    savedAt: row.savedAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    tripPlaceIds: links.map((link) => link.id),
  };
}

/**
 * Undo a removal: insert the row again with its old id and saved date, owned
 * by the caller, and point the trip places it had back at it (only places of
 * the caller's trips that still have no saved place). When the place was
 * saved again in the meantime, that newer row wins and is returned.
 */
export async function restoreAdvisorPlace(removed: RemovedAdvisorPlace, scope: ScopeInput): Promise<AdvisorPlace> {
  if (!isUuid(removed.id)) throw new NotFoundError("saved place");
  const place = await getPlace(removed.placeId);
  if (!place) throw new NotFoundError("place");
  const owner = toScope(scope);
  const tripPlaceIds = removed.tripPlaceIds.filter(isUuid);
  const own = and(eq(advisorPlaces.id, removed.id), eq(advisorPlaces.ownerId, owner.ownerId)) as SQL;

  const insert = db
    .insert(advisorPlaces)
    .values({
      id: removed.id,
      ownerId: owner.ownerId,
      orgId: owner.orgId,
      placeId: place.id,
      city: removed.city.trim(),
      note: removed.note.trim(),
      tags: removed.tags,
      savedAt: new Date(removed.savedAt),
      lastUsedAt: removed.lastUsedAt ? new Date(removed.lastUsedAt) : null,
      placeName: place.name,
    })
    .onConflictDoNothing();
  // Re-link only when the row above is the caller's: the insert is skipped
  // when the place was saved again under a new id in the meantime.
  const relink = db
    .update(tripPlaces)
    .set({ advisorPlaceId: removed.id })
    .where(
      and(
        inArray(tripPlaces.id, tripPlaceIds.length > 0 ? tripPlaceIds : [removed.id]),
        eq(tripPlaces.placeId, place.id),
        isNull(tripPlaces.advisorPlaceId),
        inArray(tripPlaces.tripId, db.select({ id: trips.id }).from(trips).where(inScope(trips, scope))),
        sql`exists (select 1 from advisor_places ap where ap.id = ${removed.id} and ap.owner_id = ${owner.ownerId})`,
      ),
    );
  const [, refreshed] = await db.batch([insert, refreshAdvisorPlaceSearch(own), relink]);
  const restored = refreshed[0];
  if (restored) return restored;
  const current = await getAdvisorPlaceForPlace(scope, place.id);
  if (!current) throw new NotFoundError("saved place");
  return current;
}
