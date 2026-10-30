import "server-only";

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

import { buildSignals, searchExclusions, type SignalTraveler, type TripSignals } from "@/lib/agent/tools/signals";
import { getAdvisor } from "@/lib/auth/advisor";
import type { ScopeInput } from "@/lib/auth/scope";
import { listFavorites, type Client } from "@/lib/clients";
import type { Destination } from "@/lib/contracts";
import { db } from "@/lib/db";
import { clients, itinerarySlots, places, tripPlaces, tripTravelers } from "@/lib/db/schema";
import { listAdvisorPlaces, type AdvisorPlaceRow } from "@/lib/places";
import { haversineM, MAX_DISTANCE_FACTOR } from "@/lib/qloo/normalize";

import type { Trip } from "./contracts";

// What drives a trip's searches, read in one place so every search path gets
// the same answer: find_places, score_places and remove_place through
// loadToolTrip, the UI's replace through replace.ts. Favorites of every
// profiled traveler (places, then artists and films), the advisor's places
// when blended, and the places already in the itinerary, plus what a search
// must leave out. Everything is read for the trip's owner, whoever is asking,
// so a teammate's replace runs on the same signals as the board.

export type TripSignalSource = Pick<Trip, "id" | "clientId" | "clientName" | "ownerId" | "orgId" | "destination">;

export type TripSignalFacts = {
  travelers: SignalTraveler[];
  /** Every client on the trip: the trip's client and the profiled travelers. */
  clientIds: string[];
  clients: Client[];
  signals: TripSignals;
  /** The advisor's saved places in the destination (by city name or distance). */
  advisorPlaces: AdvisorPlaceRow[];
  blendMyTaste: boolean;
  /** Entity ids a search leaves out: the itinerary, then the removed places. */
  excludeIds: string[];
};

export function tripScope(trip: Pick<Trip, "ownerId" | "orgId">): ScopeInput {
  return { ownerId: trip.ownerId, orgIds: trip.orgId ? [trip.orgId] : [], orgId: trip.orgId };
}

function inDestination(place: AdvisorPlaceRow, destination: Destination): boolean {
  if (place.city.trim().toLowerCase() === destination.name.trim().toLowerCase()) return true;
  if (place.lat === null || place.lon === null) return false;
  const distance = haversineM(place.lat, place.lon, destination.lat, destination.lon);
  return distance <= destination.radiusM * MAX_DISTANCE_FACTOR;
}

export async function loadTripSignals(trip: TripSignalSource): Promise<TripSignalFacts> {
  const scope = tripScope(trip);
  const travelerRows = await db
    .select()
    .from(tripTravelers)
    .where(eq(tripTravelers.tripId, trip.id))
    .orderBy(asc(tripTravelers.position));
  const travelers =
    travelerRows.length > 0
      ? travelerRows.map((t) => ({ name: t.name, clientId: t.clientId, role: t.role }))
      : [{ name: trip.clientName, clientId: trip.clientId, role: "client" }];
  const clientIds = [...new Set([trip.clientId, ...travelers.map((t) => t.clientId).filter((id): id is string => !!id)])];

  const [clientRows, advisor, saved, itineraryRows, removedRows] = await Promise.all([
    db.select().from(clients).where(inArray(clients.id, clientIds)),
    getAdvisor(trip.ownerId),
    listAdvisorPlaces(scope, { limit: 500 }),
    // A fixed order, so the capped picks and their hash do not move between reads.
    db
      .select({ entityId: places.entityId })
      .from(itinerarySlots)
      .innerJoin(tripPlaces, eq(tripPlaces.id, itinerarySlots.tripPlaceId))
      .innerJoin(places, eq(places.id, tripPlaces.placeId))
      .where(and(eq(itinerarySlots.tripId, trip.id), ne(tripPlaces.status, "removed")))
      .orderBy(asc(itinerarySlots.day), asc(itinerarySlots.slot), asc(itinerarySlots.position)),
    db
      .select({ entityId: places.entityId })
      .from(tripPlaces)
      .innerJoin(places, eq(places.id, tripPlaces.placeId))
      .where(and(eq(tripPlaces.tripId, trip.id), eq(tripPlaces.status, "removed")))
      .orderBy(desc(tripPlaces.updatedAt)),
  ]);
  const favoriteLists = await Promise.all(clientIds.map((id) => listFavorites(id, scope)));
  const favorites = favoriteLists.flat().map((f) => ({
    clientId: f.clientId,
    entityId: f.entityId,
    name: f.place?.name ?? f.query,
    match: f.match,
  }));

  const advisorPlaces = saved.filter((p) => inDestination(p, trip.destination));
  const blendMyTaste = advisor?.blendMyTaste ?? false;
  const tripPickEntityIds = itineraryRows.map((r) => r.entityId);
  const signals = buildSignals({
    travelers,
    favorites,
    media: clientRows.flatMap((c) => c.mediaFavorites.map((m) => ({ ...m, clientId: c.id }))),
    advisorPlaceEntityIds: advisorPlaces.map((p) => p.entityId),
    blendMyTaste,
    tripPickEntityIds,
  });

  return {
    travelers,
    clientIds,
    clients: clientRows,
    signals,
    advisorPlaces,
    blendMyTaste,
    excludeIds: searchExclusions(tripPickEntityIds, removedRows.map((r) => r.entityId)),
  };
}
