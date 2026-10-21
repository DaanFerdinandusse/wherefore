import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, getTableColumns, sql, type SQL } from "drizzle-orm";

import { NotFoundError } from "@/lib/auth/errors";
import { inScope, isUuid, toScope } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { advisorPlaces, places } from "@/lib/db/schema";

import type {
  AdvisorPlace,
  PlaceUpsert,
  RemoveAdvisorPlace,
  SaveAdvisorPlace,
  UpdateAdvisorPlaceNote,
  UpsertPlaces,
} from "./contracts";
import { getPlace } from "./queries";

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

  // Refresh only the columns this batch carries. A nullable column the new
  // data leaves null keeps what we had (a search hit has fewer fields than an
  // entities lookup).
  const present = new Set<PlaceKey>();
  for (const row of merged) for (const key of Object.keys(row) as PlaceKey[]) present.add(key);

  const set: Record<string, SQL> = { updatedAt: sql`now()` };
  for (const key of present) {
    if (FIXED_KEYS.has(key)) continue;
    const column = placeColumns[key];
    const incoming = sql`excluded.${sql.identifier(column.name)}`;
    set[key] = column.notNull ? incoming : sql`coalesce(${incoming}, ${column})`;
  }
  if (!present.has("fetchedAt")) set.fetchedAt = sql`now()`;

  const returned = await db
    .insert(places)
    .values(merged)
    .onConflictDoUpdate({ target: places.entityId, set })
    .returning({ id: places.id, entityId: places.entityId });
  return Object.fromEntries(returned.map((row) => [row.entityId, row.id]));
};

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
