import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { advisorPlaces, advisors, chats, clients, trips } from "@/lib/db/schema";

// The owner's workspace as rows: who the owner is (read from Neon Auth's own
// schema, never written), how many rows they have per table, and the reset.

export type AuthUserRow = { id: string; email: string; name: string | null; createdAt: string | null };

export class OwnerNotFoundError extends Error {
  override name = "OwnerNotFoundError";
}

/** The Neon Auth user by id or email. Reads neon_auth."user" only. */
export async function findAuthUser(owner: { id: string } | { email: string }): Promise<AuthUserRow> {
  const where =
    "id" in owner ? sql`u.id::text = ${owner.id}` : sql`lower(u.email) = lower(${owner.email})`;
  const result = await db.execute<AuthUserRow>(sql`
    select u.id::text as id, u.email, u.name, u."createdAt"::text as "createdAt"
    from neon_auth."user" u
    where ${where}
    limit 1
  `);
  const row = result.rows[0];
  if (!row) {
    const what = "id" in owner ? `id ${owner.id}` : `email ${owner.email}`;
    throw new OwnerNotFoundError(
      `No Neon Auth user with ${what} in this database. Sign up in the app first (or POST /sign-up/email), then run the seed again.`,
    );
  }
  return row;
}

export const COUNTED_TABLES = [
  ["advisors", "Advisor"],
  ["clients", "Clients"],
  ["client_favorites", "Favorites"],
  ["advisor_places", "My places"],
  ["trips", "Trips"],
  ["trip_travelers", "Travelers"],
  ["chats", "Chats"],
  ["trip_places", "Trip places"],
  ["itinerary_slots", "Itinerary slots"],
  ["trip_calls", "Trip calls"],
  ["places", "Places (shared cache)"],
] as const;

export type TableName = (typeof COUNTED_TABLES)[number][0];
export type RowCounts = Record<TableName, number>;

/** Rows per table for this owner; `places` is the shared cache, counted whole. */
export async function countRows(ownerId: string): Promise<RowCounts> {
  const ownTrips = sql`select id from trips where owner_id = ${ownerId}`;
  const result = await db.execute<RowCounts>(sql`
    select
      (select count(*)::int from advisors where user_id = ${ownerId}) as advisors,
      (select count(*)::int from clients where owner_id = ${ownerId}) as clients,
      (select count(*)::int from client_favorites
        where client_id in (select id from clients where owner_id = ${ownerId})) as client_favorites,
      (select count(*)::int from advisor_places where owner_id = ${ownerId}) as advisor_places,
      (select count(*)::int from trips where owner_id = ${ownerId}) as trips,
      (select count(*)::int from trip_travelers where trip_id in (${ownTrips})) as trip_travelers,
      (select count(*)::int from chats where owner_id = ${ownerId}) as chats,
      (select count(*)::int from trip_places where trip_id in (${ownTrips})) as trip_places,
      (select count(*)::int from itinerary_slots where trip_id in (${ownTrips})) as itinerary_slots,
      (select count(*)::int from trip_calls where trip_id in (${ownTrips})) as trip_calls,
      (select count(*)::int from places) as places
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Could not count rows");
  return row;
}

/**
 * Delete this owner's chats, trips (their travelers, trip places, asks, slots
 * and calls go with them), saved places and clients (favorites go with them),
 * in one batch, children before the rows they point at. The advisors row
 * stays; its taste tags are cleared so the next seed recomputes them. The
 * shared places cache and other owners' rows are never touched.
 */
export async function resetWorkspace(ownerId: string): Promise<{ trips: number; clients: number; advisorPlaces: number }> {
  const [, deletedTrips, deletedPlaces, deletedClients] = await db.batch([
    db.delete(chats).where(eq(chats.ownerId, ownerId)),
    db.delete(trips).where(eq(trips.ownerId, ownerId)).returning({ id: trips.id }),
    db.delete(advisorPlaces).where(eq(advisorPlaces.ownerId, ownerId)).returning({ id: advisorPlaces.id }),
    db.delete(clients).where(eq(clients.ownerId, ownerId)).returning({ id: clients.id }),
    db.update(advisors).set({ tasteTags: [], updatedAt: sql`now()` }).where(eq(advisors.userId, ownerId)),
  ]);
  return { trips: deletedTrips.length, clients: deletedClients.length, advisorPlaces: deletedPlaces.length };
}
