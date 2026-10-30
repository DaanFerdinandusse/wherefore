import "server-only";

import { and, asc, eq, ne, sql } from "drizzle-orm";

import { inScope, isUuid, type ScopeInput } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { askPlaces, places, tripAsks, tripPlaces, trips } from "@/lib/db/schema";
import { getAdvisorPlaceForPlace, getPlacesByEntityIds } from "@/lib/places";
import { categoryOf, favoriteDrivers } from "@/lib/qloo/normalize";

import { buildProfilePlace, type FavoritePlace, type TripPlaceProfile } from "./profile-types";
import { listTripPlaceCards } from "./queries";

// Loads everything the place profile sheet shows beyond the card: the place
// row (images, properties, tags, Google id), the advisor's saved row with its
// trip count, the asks the place belongs to and the photos of the favorites
// that drove the match. Scoped through the trip: out of scope reads as null.

export async function loadTripPlaceProfile(tripPlaceId: string, scope: ScopeInput): Promise<TripPlaceProfile | null> {
  if (!isUuid(tripPlaceId)) return null;
  const [row] = await db
    .select({ tripId: tripPlaces.tripId, place: places })
    .from(tripPlaces)
    .innerJoin(trips, eq(trips.id, tripPlaces.tripId))
    .innerJoin(places, eq(places.id, tripPlaces.placeId))
    .where(and(eq(tripPlaces.id, tripPlaceId), inScope(trips, scope)))
    .limit(1);
  if (!row) return null;

  const [cards, advisorPlace, askRows] = await Promise.all([
    listTripPlaceCards(row.tripId, scope, { tripPlaceIds: [tripPlaceId] }),
    getAdvisorPlaceForPlace(scope, row.place.id),
    db
      .select({ id: tripAsks.id, label: tripAsks.label })
      .from(askPlaces)
      .innerJoin(tripAsks, eq(tripAsks.id, askPlaces.askId))
      .where(and(eq(askPlaces.tripPlaceId, tripPlaceId), ne(tripAsks.status, "archived")))
      .orderBy(asc(tripAsks.createdAt)),
  ]);
  const card = cards[0];
  if (!card) return null;

  const named = favoriteDrivers(card.because);
  const [driverPlaces, inTrips] = await Promise.all([
    getPlacesByEntityIds(named.map((driver) => driver.entityId)),
    advisorPlace
      ? db
          .select({ count: sql<number>`count(distinct ${tripPlaces.tripId})::int` })
          .from(tripPlaces)
          .where(eq(tripPlaces.advisorPlaceId, advisorPlace.id))
          .then((rows) => rows[0]?.count ?? 0)
      : Promise.resolve(0),
  ]);
  const byEntity = new Map(driverPlaces.map((place) => [place.entityId, place]));

  return {
    card,
    place: buildProfilePlace(row.place),
    advisorPlace: advisorPlace
      ? {
          id: advisorPlace.id,
          note: advisorPlace.note,
          savedAt: advisorPlace.savedAt.toISOString(),
          inTrips,
        }
      : null,
    asks: askRows,
    drivers: named.map((driver) => {
      const place = byEntity.get(driver.entityId);
      return {
        entityId: driver.entityId,
        name: driver.name,
        imageUrl: place?.images[0]?.url ?? null,
        city: place?.city ?? null,
      };
    }),
  };
}

/** A client favorite by its entity id: the shared place row, so no scope. Null without a row. */
export async function loadFavoritePlace(entityId: string): Promise<FavoritePlace | null> {
  const [row] = await getPlacesByEntityIds([entityId]);
  return row ? { place: buildProfilePlace(row), category: categoryOf(row) } : null;
}
