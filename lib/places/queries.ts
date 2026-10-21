import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { inScope, isUuid } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { advisorPlaces, places } from "@/lib/db/schema";
import { normalizeQuery, trgmMatch, trgmRank } from "@/lib/search/trgm";

import type {
  AdvisorCities,
  AdvisorPlaceRow,
  GetAdvisorPlaceForPlace,
  GetPlace,
  GetPlacesByEntityIds,
  ListAdvisorPlaces,
} from "./contracts";

export const getPlace: GetPlace = async (id) => {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(places).where(eq(places.id, id)).limit(1);
  return row ?? null;
};

export const getPlacesByEntityIds: GetPlacesByEntityIds = async (entityIds) => {
  const ids = [...new Set(entityIds)];
  if (ids.length === 0) return [];
  return db.select().from(places).where(inArray(places.entityId, ids));
};

// The outer row, qualified, for the correlated subqueries below.
const ADVISOR_PLACE_ID = sql.raw(`"advisor_places"."id"`);

const advisorPlaceFields = {
  id: advisorPlaces.id,
  placeId: advisorPlaces.placeId,
  entityId: places.entityId,
  name: advisorPlaces.placeName,
  city: advisorPlaces.city,
  note: advisorPlaces.note,
  tags: advisorPlaces.tags,
  savedAt: advisorPlaces.savedAt,
  lastUsedAt: advisorPlaces.lastUsedAt,
  primaryType: places.primaryType,
  neighborhood: places.neighborhood,
  address: places.address,
  lat: places.lat,
  lon: places.lon,
  imageUrl: sql<string | null>`${places.images} -> 0 ->> 'url'`,
  inTrips: sql<number>`(
    select count(distinct tp.trip_id)::int
    from trip_places tp
    where tp.advisor_place_id = ${ADVISOR_PLACE_ID}
  )`,
  lastTripTitle: sql<string | null>`(
    select t.title
    from trip_places tp
    join trips t on t.id = tp.trip_id
    where tp.advisor_place_id = ${ADVISOR_PLACE_ID}
    order by t.updated_at desc
    limit 1
  )`,
};

export const listAdvisorPlaces: ListAdvisorPlaces = async (ownerId, options = {}) => {
  const q = normalizeQuery(options.q);
  const city = options.city?.trim();
  const rows: AdvisorPlaceRow[] = await db
    .select(advisorPlaceFields)
    .from(advisorPlaces)
    .innerJoin(places, eq(places.id, advisorPlaces.placeId))
    .where(
      and(
        inScope(advisorPlaces, ownerId),
        city ? sql`lower(${advisorPlaces.city}) = lower(${city})` : undefined,
        q ? trgmMatch(advisorPlaces.search, q) : undefined,
      ),
    )
    .orderBy(
      ...(q ? [desc(trgmRank(advisorPlaces.search, q))] : []),
      desc(advisorPlaces.savedAt),
    )
    .limit(options.limit ?? 500);
  return rows;
};

export const getAdvisorPlaceForPlace: GetAdvisorPlaceForPlace = async (ownerId, placeId) => {
  if (!isUuid(placeId)) return null;
  const [row] = await db
    .select()
    .from(advisorPlaces)
    .where(and(eq(advisorPlaces.placeId, placeId), inScope(advisorPlaces, ownerId)))
    .limit(1);
  return row ?? null;
};

export const advisorCities: AdvisorCities = async (ownerId) =>
  db
    .select({ city: advisorPlaces.city, count: sql<number>`count(*)::int` })
    .from(advisorPlaces)
    .where(inScope(advisorPlaces, ownerId))
    .groupBy(advisorPlaces.city)
    .orderBy(desc(sql`count(*)`), advisorPlaces.city);
