import "server-only";

import { and, eq, ne } from "drizzle-orm";

import type { ScopeInput } from "@/lib/auth/scope";
import type { Client } from "@/lib/clients";
import type { Destination, TasteTag } from "@/lib/contracts";
import { db } from "@/lib/db";
import { itinerarySlots, places, tripPlaces, trips } from "@/lib/db/schema";
import type { AdvisorPlaceRow } from "@/lib/places";
import { logTripCall, type Trip } from "@/lib/trips";
import { asSlotName } from "@/lib/trips/map";
import { loadTripSignals, tripScope } from "@/lib/trips/trip-signals";
import type { QlooCall } from "@/lib/qloo";

import { guarded, type TurnRef } from "../writes";

import type { PlacedPoint } from "./search-area";
import { signalsForAsk, type AskFocus, type SignalInputs, type TripSignals } from "./signals";

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
  /** What `signals` was built from: a search rebuilds it for its own focus (focusedOn). */
  signalInputs: SignalInputs;
  /** Favorites saved on the trip's clients, matched or not. */
  savedFavorites: number;
  /** The advisor's saved places in the destination (by city name or distance). */
  advisorPlaces: AdvisorPlaceRow[];
  blendMyTaste: boolean;
  /** Entity ids a search leaves out: the itinerary and the removed places. */
  excludeIds: string[];
};

export class TripGoneError extends Error {
  constructor() {
    super("This chat's trip no longer exists.");
    this.name = "TripGoneError";
  }
}

export async function loadToolTrip(tripId: string): Promise<ToolTrip> {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new TripGoneError();
  const scope = tripScope(trip);
  const { travelers, clientIds, clients: clientRows, signals, signalInputs, savedFavorites, advisorPlaces, blendMyTaste, excludeIds } =
    await loadTripSignals(trip);

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
    signalInputs,
    savedFavorites,
    advisorPlaces,
    blendMyTaste,
    excludeIds,
  };
}

/** The trip as one search sees it: everything downstream (drivers, reasons, the weighing) reads these signals. */
export function focusedOn(ctx: ToolTrip, focus: AskFocus): ToolTrip {
  return { ...ctx, signals: signalsForAsk(ctx.signalInputs, focus) };
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
