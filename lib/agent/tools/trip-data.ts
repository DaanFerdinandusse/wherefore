import "server-only";

import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { getAdvisor } from "@/lib/auth/advisor";
import type { ScopeInput } from "@/lib/auth/scope";
import { listFavorites, type Client } from "@/lib/clients";
import type { Destination, TasteTag } from "@/lib/contracts";
import { db } from "@/lib/db";
import { clients, itinerarySlots, places, tripPlaces, trips, tripTravelers } from "@/lib/db/schema";
import { listAdvisorPlaces, type AdvisorPlaceRow } from "@/lib/places";
import { haversineM, MAX_DISTANCE_FACTOR } from "@/lib/qloo/normalize";
import { logTripCall, type Trip } from "@/lib/trips";
import { asSlotName } from "@/lib/trips/map";
import type { QlooCall } from "@/lib/qloo";

import { guarded, type TurnRef } from "../writes";

import type { PlacedPoint } from "./search-area";
import { buildSignals, type TripSignals } from "./signals";

// What a tool step needs to know about its trip, read once per step: the
// trip row and its scope, the travelers' signals, the client's taste tags
// and rules, and the advisor's own places in the destination city.

export type ToolTrip = {
  trip: Trip;
  /** The trip's owner (and org): the scope every slice call runs under. */
  scope: ScopeInput;
  destination: Destination;
  clientId: string;
  clientName: string;
  client: Client | undefined;
  /** Taste tags of every profiled traveler, the trip's client first. */
  tasteTags: TasteTag[];
  rules: string[];
  travelerNames: string[];
  signals: TripSignals;
  /** The advisor's saved places in the destination (by city name or distance). */
  advisorPlaces: AdvisorPlaceRow[];
  blendMyTaste: boolean;
};

export class TripGoneError extends Error {
  constructor() {
    super("This chat's trip no longer exists.");
    this.name = "TripGoneError";
  }
}

function inDestination(place: AdvisorPlaceRow, destination: Destination): boolean {
  if (place.city.trim().toLowerCase() === destination.name.trim().toLowerCase()) return true;
  if (place.lat === null || place.lon === null) return false;
  const distance = haversineM(place.lat, place.lon, destination.lat, destination.lon);
  return distance <= destination.radiusM * MAX_DISTANCE_FACTOR;
}

export async function loadToolTrip(tripId: string): Promise<ToolTrip> {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new TripGoneError();
  const scope: ScopeInput = { ownerId: trip.ownerId, orgIds: trip.orgId ? [trip.orgId] : [], orgId: trip.orgId };

  const travelerRows = await db
    .select()
    .from(tripTravelers)
    .where(eq(tripTravelers.tripId, tripId))
    .orderBy(asc(tripTravelers.position));
  const travelers =
    travelerRows.length > 0
      ? travelerRows.map((t) => ({ name: t.name, clientId: t.clientId, role: t.role }))
      : [{ name: trip.clientName, clientId: trip.clientId, role: "client" }];
  const clientIds = [...new Set([trip.clientId, ...travelers.map((t) => t.clientId).filter((id): id is string => !!id)])];

  const [clientRows, advisor, saved] = await Promise.all([
    db.select().from(clients).where(inArray(clients.id, clientIds)),
    getAdvisor(trip.ownerId),
    listAdvisorPlaces(scope, { limit: 500 }),
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
  const signals = buildSignals({
    travelers,
    favorites,
    advisorPlaceEntityIds: advisorPlaces.map((p) => p.entityId),
    blendMyTaste,
  });

  const byId = new Map(clientRows.map((c) => [c.id, c]));
  const ordered = clientIds.map((id) => byId.get(id)).filter((c): c is Client => !!c);
  const tagSeen = new Set<string>();
  const tasteTags: TasteTag[] = [];
  for (const c of ordered) {
    for (const tag of c.tasteTags) {
      const key = tag.name.toLowerCase();
      if (tagSeen.has(key)) continue;
      tagSeen.add(key);
      tasteTags.push(tag);
    }
  }

  return {
    trip,
    scope,
    destination: trip.destination,
    clientId: trip.clientId,
    clientName: trip.clientName,
    client: byId.get(trip.clientId),
    tasteTags,
    rules: [...new Set(ordered.flatMap((c) => c.groundRules))],
    travelerNames: travelers.map((t) => t.name),
    signals,
    advisorPlaces,
    blendMyTaste,
  };
}

/** The itinerary's places that have coordinates: what a search stays close to. */
export async function loadPlacedPoints(tripId: string): Promise<PlacedPoint[]> {
  const rows = await db
    .select({ day: itinerarySlots.day, slot: itinerarySlots.slot, name: places.name, lat: places.lat, lon: places.lon })
    .from(itinerarySlots)
    .innerJoin(tripPlaces, eq(tripPlaces.id, itinerarySlots.tripPlaceId))
    .innerJoin(places, eq(places.id, tripPlaces.placeId))
    .where(and(eq(itinerarySlots.tripId, tripId), ne(tripPlaces.status, "removed")));
  return rows.flatMap((r) =>
    r.lat !== null && r.lon !== null ? [{ day: r.day, slot: asSlotName(r.slot), name: r.name, lat: r.lat, lon: r.lon }] : [],
  );
}

/** "Ana" from "Ana Ruiz". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Where a batch of calls was made: the tool call and a step name inside it. */
export type CallKey = { toolCallId: string; step: string };

/**
 * Logs provider calls for "How we got this", one row each, guarded by the
 * turn in the insert itself. `source` is "seed", "ask:<id>" or "manual".
 * Keyed by (tool call, step, index), so a retried step rewrites its rows
 * instead of logging the same calls twice.
 */
export async function logCalls(
  turn: TurnRef,
  ctx: Pick<ToolTrip, "scope">,
  calls: QlooCall[],
  source: string,
  key: CallKey,
  loosened: string[] = [],
): Promise<void> {
  if (calls.length === 0) return;
  await guarded(turn, async (guard) => {
    for (const [index, call] of calls.entries()) {
      await logTripCall(
        turn.tripId,
        {
          endpoint: call.endpoint,
          params: call.params,
          count: call.count,
          ms: call.ms,
          loosened,
          source,
          key: { toolCallId: key.toolCallId, step: key.step, index },
        },
        ctx.scope,
        { turn: guard },
      );
    }
  });
}
