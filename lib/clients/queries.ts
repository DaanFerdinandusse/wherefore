import "server-only";

import { and, asc, desc, eq, ne, sql, type SQL } from "drizzle-orm";

import { inScope, isUuid } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { clientFavorites, clients, places, trips } from "@/lib/db/schema";
import { normalizeQuery, trgmMatch, trgmRank } from "@/lib/search/trgm";

import type {
  ClientStatus,
  ClientSummary,
  ClientTripRow,
  FavoriteWithPlace,
  GetClient,
  GetClientProfile,
  ListClients,
  ListFavorites,
  ListRecentClients,
} from "./contracts";

// Reads for the Clients page, the client profile and the trip bar. The summary
// columns are correlated subqueries, one row per client, so the list is one
// round trip whatever its length.

// Drizzle prints a single-table select's columns unqualified, which a
// correlated subquery would read as its own. Name the outer row explicitly.
const outer = {
  clientId: sql.raw(`"clients"."id"`),
  clientUpdatedAt: sql.raw(`"clients"."updated_at"`),
};

const summaryFields = {
  id: clients.id,
  name: clients.name,
  homeCity: clients.homeCity,
  avatarUrl: clients.avatarUrl,
  status: sql<ClientStatus>`${clients.status}`,
  favoritesCount: sql<number>`(
    select count(*)::int from client_favorites f where f.client_id = ${outer.clientId}
  )`,
  favoriteImages: sql<string[]>`coalesce((
    select json_agg(x.url order by x.position)
    from (
      select f.position, p.images -> 0 ->> 'url' as url
      from client_favorites f
      join places p on p.id = f.place_id
      where f.client_id = ${outer.clientId} and jsonb_array_length(p.images) > 0
      order by f.position
      limit 4
    ) x
  ), '[]'::json)`,
  nextTrip: sql<ClientSummary["nextTrip"]>`(
    select json_build_object('id', t.id, 'title', t.title, 'startDate', t.start_date)
    from trips t
    where t.client_id = ${outer.clientId} and (t.end_date is null or t.end_date >= current_date)
    order by t.start_date asc nulls last, t.created_at desc
    limit 1
  )`,
  lastActivityAt: sql<Date>`greatest(${outer.clientUpdatedAt}, (
    select max(t.updated_at) from trips t where t.client_id = ${outer.clientId}
  ))`.mapWith(clients.updatedAt),
};

/** Summary rows for any filter, best match first when `q` is given. */
export async function selectClientSummaries(
  where: SQL | undefined,
  options: { q?: string | null; orderBy?: "activity" | "name"; limit?: number } = {},
): Promise<ClientSummary[]> {
  const q = normalizeQuery(options.q);
  const order =
    options.orderBy === "name"
      ? [asc(clients.name)]
      : [desc(summaryFields.lastActivityAt)];
  return db
    .select(summaryFields)
    .from(clients)
    .where(and(where, q ? trgmMatch(clients.search, q) : undefined))
    .orderBy(...(q ? [desc(trgmRank(clients.search, q)), ...order] : order))
    .limit(options.limit ?? 200);
}

export const listClients: ListClients = (ownerId, options = {}) =>
  selectClientSummaries(
    and(
      inScope(clients, ownerId),
      options.includeArchived ? undefined : ne(clients.status, "archived"),
    ),
    { q: options.q, orderBy: "activity", limit: options.limit },
  );

export const listRecentClients: ListRecentClients = (ownerId, limit = 4) =>
  selectClientSummaries(and(inScope(clients, ownerId), eq(clients.status, "active")), {
    orderBy: "activity",
    limit,
  });

export const getClient: GetClient = async (id, scope) => {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), inScope(clients, scope)))
    .limit(1);
  return row ?? null;
};

function favoritesQuery(clientId: string) {
  return db
    .select({
      favorite: clientFavorites,
      place: {
        id: places.id,
        entityId: places.entityId,
        name: places.name,
        city: places.city,
        imageUrl: sql<string | null>`${places.images} -> 0 ->> 'url'`,
      },
    })
    .from(clientFavorites)
    .leftJoin(places, eq(places.id, clientFavorites.placeId))
    .where(eq(clientFavorites.clientId, clientId))
    .orderBy(asc(clientFavorites.position), asc(clientFavorites.createdAt));
}

function toFavoriteWithPlace(row: Awaited<ReturnType<typeof favoritesQuery>>[number]): FavoriteWithPlace {
  return { ...row.favorite, place: row.place };
}

export const listFavorites: ListFavorites = async (clientId, scope) => {
  const client = await getClient(clientId, scope);
  if (!client) return [];
  const rows = await favoritesQuery(clientId);
  return rows.map(toFavoriteWithPlace);
};

export const getClientProfile: GetClientProfile = async (id, scope) => {
  if (!isUuid(id)) return null;
  const [clientRows, favoriteRows, tripRows] = await db.batch([
    db
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), inScope(clients, scope)))
      .limit(1),
    favoritesQuery(id),
    db
      .select({
        id: trips.id,
        title: trips.title,
        destinationName: sql<string>`${trips.destination} ->> 'name'`,
        startDate: trips.startDate,
        endDate: trips.endDate,
        datesMode: trips.datesMode,
        upcoming: sql<boolean>`(${trips.endDate} is null or ${trips.endDate} >= current_date)`,
      })
      .from(trips)
      .where(and(eq(trips.clientId, id), inScope(trips, scope)))
      .orderBy(sql`${trips.startDate} asc nulls last`),
  ]);
  const client = clientRows[0];
  if (!client) return null;

  const toRow = (t: (typeof tripRows)[number]): ClientTripRow => ({
    id: t.id,
    title: t.title,
    destinationName: t.destinationName,
    startDate: t.startDate,
    endDate: t.endDate,
    datesMode: t.datesMode,
  });
  const upcoming = tripRows.filter((t) => t.upcoming).map(toRow);
  const past = tripRows
    .filter((t) => !t.upcoming)
    .map(toRow)
    .reverse();

  return { client, favorites: favoriteRows.map(toFavoriteWithPlace), trips: { upcoming, past } };
};
