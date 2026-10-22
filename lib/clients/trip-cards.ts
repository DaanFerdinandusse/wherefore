import "server-only";

import { and, inArray, sql } from "drizzle-orm";

import { inScope, isUuid } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { trips } from "@/lib/db/schema";

import type { ClientTripCard, CountClientTrips, ListClientTripCards } from "./contracts";

// Trip cards for the Clients page (the next trip per row) and the profile's
// Trips panel: the photo, the stage inputs and the number of added places.
// One query; the photo and the count are correlated subqueries.

const outerTripId = sql.raw(`"trips"."id"`);

export const listClientTripCards: ListClientTripCards = async (tripIds, scope) => {
  const ids = tripIds.filter(isUuid);
  if (ids.length === 0) return [];
  const rows: ClientTripCard[] = await db
    .select({
      id: trips.id,
      clientId: trips.clientId,
      title: trips.title,
      destinationName: sql<string>`${trips.destination} ->> 'name'`,
      startDate: trips.startDate,
      endDate: trips.endDate,
      datesMode: trips.datesMode,
      shareToken: trips.shareToken,
      stageOverride: trips.stageOverride,
      imageUrl: sql<string | null>`(
        select p.images -> 0 ->> 'url'
        from trip_places tp
        join places p on p.id = tp.place_id
        where tp.trip_id = ${outerTripId} and tp.status <> 'removed' and jsonb_array_length(p.images) > 0
        order by (tp.status = 'added') desc, tp.best_score desc nulls last, tp.position
        limit 1
      )`,
      placeCount: sql<number>`(
        select count(*)::int from trip_places tp where tp.trip_id = ${outerTripId} and tp.status = 'added'
      )`,
    })
    .from(trips)
    .where(and(inArray(trips.id, ids), inScope(trips, scope)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
};

export const countClientTrips: CountClientTrips = async (clientIds, scope) => {
  const ids = clientIds.filter(isUuid);
  if (ids.length === 0) return {};
  const rows = await db
    .select({ clientId: trips.clientId, count: sql<number>`count(*)::int` })
    .from(trips)
    .where(and(inArray(trips.clientId, ids), inScope(trips, scope)))
    .groupBy(trips.clientId);
  return Object.fromEntries(rows.map((row) => [row.clientId, row.count]));
};
