import "server-only";

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { FatalError } from "workflow";

import type { ScorePlacesOutput } from "@/lib/contracts";
import { db } from "@/lib/db";
import { places, tripPlaces } from "@/lib/db/schema";
import { nameMatches } from "@/lib/demo/rules";
import { upsertPlaces } from "@/lib/places";
import { displayScore, haversineM, MAX_DISTANCE_FACTOR, scoreEntities, searchEntities, type QlooCall } from "@/lib/qloo";
import { listTripPlaceCards } from "@/lib/trips";

import { cacheWrite, type TurnRef } from "../writes";

import { advisorPlaceIdOf, driversOf, resolveTripPlaceIds, signalHashOf } from "./search-core";
import { signalsForScoring } from "./signals";
import { loadToolTrip, logCalls } from "./trip-data";

// score_places (PLAN 7): how well a shortlist fits the client. The shortlist
// is trip places by id, names (resolved near the destination) or the
// advisor's own places in the city. Scores sit on the board's scale (the
// trip's current best affinities), so a 70 here means the same as a 70 on a
// card. Writes only the place cache; the board itself does not change.

export type ScorePlacesInput = {
  place_ids?: string[];
  names?: string[];
  scope?: "advisor_places";
};

const MAX_NAMES = 10;
/** Board places scored along for the scale when none was scored on this signal set yet. */
const MAX_SCALE_PLACES = 12;

export async function scorePlacesTool(input: ScorePlacesInput, turn: TurnRef, toolCallId: string): Promise<ScorePlacesOutput> {
  const key = { toolCallId, step: "score" };
  const ctx = await loadToolTrip(turn.tripId);
  if (ctx.signals.signals.length === 0) {
    return { phase: "done", places: [], error: `${ctx.clientName} has no resolved favorites to score against yet.` };
  }
  const calls: QlooCall[] = [];
  const entityIds = new Set<string>();
  const unresolved: string[] = [];

  // Trip places by id.
  if (input.place_ids?.length) {
    const found = await resolveTripPlaceIds(turn.tripId, input.place_ids);
    const placeIds = [...new Set([...found.values()].map((r) => r.placeId))];
    if (placeIds.length > 0) {
      const rows = await db.select({ entityId: places.entityId }).from(places).where(inArray(places.id, placeIds));
      for (const row of rows) entityIds.add(row.entityId);
    }
    for (const id of input.place_ids) if (!found.has(id)) unresolved.push(id);
  }

  // The advisor's places in the city.
  if (input.scope === "advisor_places") for (const p of ctx.advisorPlaces) entityIds.add(p.entityId);

  // Names, resolved near the destination.
  const near = { lat: ctx.destination.lat, lon: ctx.destination.lon };
  const maxDistance = ctx.destination.radiusM * MAX_DISTANCE_FACTOR;
  for (const name of (input.names ?? []).slice(0, MAX_NAMES)) {
    const { candidates, calls: searchCalls } = await searchEntities(
      name,
      { types: "urn:entity:place", near, take: 5 },
      { tripId: ctx.trip.id },
    );
    calls.push(...searchCalls);
    const hit = candidates.find(
      (c) =>
        c.place &&
        nameMatches(name, c.name) &&
        (c.lat === undefined || c.lon === undefined || haversineM(c.lat, c.lon, near.lat, near.lon) <= maxDistance),
    );
    if (!hit?.place) {
      unresolved.push(name);
      continue;
    }
    const place = hit.place;
    await cacheWrite(turn, () => upsertPlaces([place]));
    entityIds.add(hit.entityId);
  }

  if (entityIds.size === 0) {
    await logCalls(turn, ctx, calls, "manual", key);
    return {
      phase: "done",
      places: [],
      unresolved,
      error: input.scope === "advisor_places" ? `No saved places in ${ctx.destination.name} yet.` : "Nothing to score.",
    };
  }

  const signals = signalsForScoring(ctx.signals, entityIds);
  if (signals.length === 0) {
    await logCalls(turn, ctx, calls, "manual", key);
    return { phase: "done", places: [], unresolved, error: `${ctx.clientName} has no resolved favorites to score against yet.` };
  }

  // The board's scale: this trip's current best affinities, scored against
  // the same signals as these (lib/trips/evidence.ts); others do not compare.
  // Every itinerary change moves the signal set, so the board can hold none:
  // then its best places are scored in the same call, for the scale only,
  // instead of ranking a lone place against itself.
  const hash = signalHashOf(ctx);
  const boardRows = await db
    .select({
      entityId: places.entityId,
      status: tripPlaces.status,
      affinity: tripPlaces.bestAffinity,
      signalHash: tripPlaces.signalHash,
    })
    .from(tripPlaces)
    .innerJoin(places, eq(places.id, tripPlaces.placeId))
    .where(and(eq(tripPlaces.tripId, turn.tripId), isNotNull(tripPlaces.bestAffinity)))
    .orderBy(desc(tripPlaces.bestAffinity));
  const sameSet = boardRows.filter((r) => !hash || !r.signalHash || r.signalHash === hash);
  const picks = new Set(ctx.signals.tripPickSignals);
  const scaleIds =
    sameSet.length > 0
      ? []
      : boardRows
          .filter((r) => r.status !== "removed" && !entityIds.has(r.entityId) && !picks.has(r.entityId))
          .slice(0, MAX_SCALE_PLACES)
          .map((r) => r.entityId);

  let scored;
  let setAffinities: number[];
  try {
    const result = await scoreEntities(
      { signals, entityIds: [...entityIds, ...scaleIds], destination: ctx.destination, favorites: ctx.signals.favorites },
      { tripId: ctx.trip.id },
    );
    calls.push(...result.calls);
    scored = result.scores.filter((s) => entityIds.has(s.entityId));
    const scale = sameSet.map((r) => r.affinity).filter((a): a is number => a !== null);
    setAffinities = scale.length > 0 ? scale : result.scores.map((s) => s.affinity);
  } catch {
    await logCalls(turn, ctx, calls, "manual", key);
    throw new FatalError("Scoring did not answer. Try again in a moment.");
  }
  await logCalls(turn, ctx, calls, "manual", key);

  // Which of these are on the board already (cards carry ids and your place).
  const cache = await db
    .select({ id: places.id, entityId: places.entityId, image: places.images })
    .from(places)
    .where(inArray(places.entityId, scored.map((s) => s.entityId)));
  const placeIdOf = new Map(cache.map((c) => [c.entityId, c.id]));
  const cards = await listTripPlaceCards(turn.tripId, ctx.scope, {
    placeIds: cache.map((c) => c.id),
  });
  const cardOf = new Map(cards.map((c) => [c.entityId, c]));

  return {
    phase: "done",
    unresolved,
    places: scored.map((s) => {
      const card = cardOf.get(s.entityId);
      const saved = ctx.advisorPlaces.find((p) => p.entityId === s.entityId);
      const advisorPlaceId = advisorPlaceIdOf(ctx, s.entityId);
      return {
        tripPlaceId: card?.tripPlaceId ?? "",
        placeId: card?.placeId ?? placeIdOf.get(s.entityId) ?? "",
        entityId: s.entityId,
        name: s.place.name,
        category: card?.category,
        score: displayScore(s.affinity, setAffinities),
        because: driversOf(ctx, s.signalScores),
        ...(card?.yourPlace
          ? { yourPlace: card.yourPlace }
          : saved && advisorPlaceId
            ? { yourPlace: { advisorPlaceId, note: saved.note } }
            : {}),
        ...(s.place.images[0]?.url ? { imageUrl: s.place.images[0].url } : {}),
      };
    }),
  };
}
