import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";

import { isUuid } from "@/lib/auth/scope";

import type { Category, Explainability, TripPlaceCard, TripPlaceSource } from "@/lib/contracts";
import { db } from "@/lib/db";
import { places, tripPlaces } from "@/lib/db/schema";
import { upsertPlaces } from "@/lib/places";
import {
  categoryOf,
  displayScore,
  explainabilityFor,
  scoreEntities,
  sharedTagsFor,
  type NormalizedPlace,
  type QlooCall,
  type ScoredEntity,
  type SignalScore,
} from "@/lib/qloo";
import { addAskPlaces, listTripPlaceCards, upsertTripPlaces } from "@/lib/trips";
import { agentModelRef, agentProviderOptions } from "@/lib/codex/provider";

import { explainPlaces, type ExplainInput } from "../explain";
import { guarded, writeReasons, type TurnRef } from "../writes";

import { favoriteSignalScores } from "./signals";
import type { ToolTrip } from "./trip-data";

// The pieces find_places, seed_trip, score_places and remove_place share:
// writing results as places and trip places, scoring the advisor's own
// places, reading cards back from the database, and the explain step. All
// writes go through the turn guard and are keyed upserts.

/** One place to put on the board, with what ranks and explains it. */
export type BoardItem = {
  place: NormalizedPlace;
  category: Category;
  affinity: number;
  score: number;
  signalScores: SignalScore[];
  source: TripPlaceSource;
};

/** Drivers limited to the client's named favorites (see signals.ts). */
export function driversOf(ctx: Pick<ToolTrip, "signals">, signalScores: readonly SignalScore[]): Explainability {
  return explainabilityFor({ signalScores: favoriteSignalScores(signalScores, ctx.signals) }, ctx.signals.favorites);
}

/** The advisor's saved place id for an entity, if it is one of theirs in this city. */
export function advisorPlaceIdOf(ctx: Pick<ToolTrip, "advisorPlaces">, entityId: string): string | undefined {
  return ctx.advisorPlaces.find((p) => p.entityId === entityId)?.id;
}

/**
 * Upserts the places and their trip places. Returns entity id to trip place
 * id. A place that is one of the advisor's own carries the link ("Your place").
 */
export async function persistBoardItems(
  turn: TurnRef,
  ctx: ToolTrip,
  items: BoardItem[],
): Promise<Map<string, string>> {
  if (items.length === 0) return new Map();
  const placeIds = await guarded(turn, () => upsertPlaces(items.map((i) => i.place)));
  const rows = items.flatMap((item) => {
    const placeId = placeIds[item.place.entityId];
    if (!placeId) return [];
    return [
      {
        placeId,
        source: item.source,
        category: item.category,
        bestAffinity: Math.round(item.affinity * 10_000) / 10_000,
        bestScore: item.score,
        explainability: driversOf(ctx, item.signalScores),
        sharedTags: sharedTagsFor(item.place, ctx.tasteTags),
        advisorPlaceId: advisorPlaceIdOf(ctx, item.place.entityId) ?? null,
      },
    ];
  });
  const tripPlaceIds = await guarded(turn, () => upsertTripPlaces(turn.tripId, rows, ctx.scope));
  const out = new Map<string, string>();
  for (const item of items) {
    const placeId = placeIds[item.place.entityId];
    const tripPlaceId = placeId ? tripPlaceIds[placeId] : undefined;
    if (tripPlaceId) out.set(item.place.entityId, tripPlaceId);
  }
  return out;
}

/** Ask tab membership, ranked in the given order (1 = best). */
export async function persistAskPlaces(
  turn: TurnRef,
  ctx: ToolTrip,
  askId: string,
  ranked: { tripPlaceId: string; item: BoardItem }[],
  startRank = 1,
): Promise<void> {
  if (ranked.length === 0) return;
  await guarded(turn, () =>
    addAskPlaces(
      askId,
      ranked.map(({ tripPlaceId, item }, index) => ({
        tripPlaceId,
        rank: startRank + index,
        affinity: Math.round(item.affinity * 10_000) / 10_000,
        score: item.score,
        explainability: driversOf(ctx, item.signalScores),
      })),
      ctx.scope,
    ),
  );
}

/** Cards from the database, in the order of `tripPlaceIds`. */
export async function cardsInOrder(ctx: ToolTrip, tripPlaceIds: string[]): Promise<TripPlaceCard[]> {
  if (tripPlaceIds.length === 0) return [];
  const cards = await listTripPlaceCards(ctx.trip.id, ctx.scope, { tripPlaceIds });
  const byId = new Map(cards.map((c) => [c.tripPlaceId, c]));
  return tripPlaceIds.map((id) => byId.get(id)).filter((c): c is TripPlaceCard => !!c);
}

export type AdvisorScore = { scored: ScoredEntity; item: BoardItem };

/**
 * Scores the advisor's saved places in the city for the trip's signals.
 * Display scores sit on the scale of `setAffinities` (the results they are
 * shown next to), so a weak "Your place" reads lower than every pick.
 */
export async function scoreAdvisorPlaces(
  ctx: ToolTrip,
  setAffinities: readonly number[],
  entityIds: string[] = ctx.advisorPlaces.map((p) => p.entityId),
): Promise<{ scores: AdvisorScore[]; calls: QlooCall[] }> {
  if (entityIds.length === 0 || ctx.signals.signals.length === 0) return { scores: [], calls: [] };
  const { scores, calls } = await scoreEntities(
    { signals: ctx.signals.signals, entityIds, destination: ctx.destination, favorites: ctx.signals.favorites },
    { tripId: ctx.trip.id },
  );
  const all = [...setAffinities, ...scores.map((s) => s.affinity)];
  const scale = setAffinities.length > 0 ? setAffinities : all;
  return {
    calls,
    scores: scores.map((scored) => ({
      scored,
      item: {
        place: scored.place,
        category: categoryOf(scored.place),
        affinity: scored.affinity,
        score: displayScore(scored.affinity, scale),
        signalScores: scored.signalScores,
        source: "advisor",
      },
    })),
  };
}

/**
 * explainStep: one model call over the cards, grounded reasons written to
 * trip_places.reason (conditional on the turn). Returns the reasons written.
 */
export async function explainCards(
  turn: TurnRef,
  ctx: ToolTrip,
  cards: TripPlaceCard[],
  abortSignal?: AbortSignal,
): Promise<Map<string, string>> {
  const todo = cards.filter((c) => !c.reason);
  if (todo.length === 0) return new Map();
  const tagRows = await db
    .select({ id: places.id, tags: places.tags })
    .from(places)
    .where(inArray(places.id, [...new Set(todo.map((c) => c.placeId))]));
  const tagsByPlace = new Map(tagRows.map((r) => [r.id, r.tags.map((t) => t.name)]));
  const inputs: ExplainInput[] = todo.map((card) => ({
    tripPlaceId: card.tripPlaceId,
    name: card.name,
    category: card.category,
    neighborhood: card.neighborhood,
    because: card.because.map((b) => ({ name: b.name, share: b.share })),
    sharedTags: card.sharedTags.map((t) => t.name),
    tags: tagsByPlace.get(card.placeId) ?? [],
    yourPlace: Boolean(card.yourPlace),
  }));
  const { reasons } = await explainPlaces(
    inputs,
    {
      clientName: ctx.clientName,
      extraNames: [...ctx.travelerNames, ctx.destination.name, ...(ctx.destination.disambiguation ? [ctx.destination.disambiguation] : [])],
    },
    { modelRef: agentModelRef(), providerOptions: agentProviderOptions(turn.chatId), abortSignal },
  );
  await writeReasons(
    turn,
    [...reasons.entries()].map(([tripPlaceId, reason]) => ({ tripPlaceId, reason })),
  );
  return reasons;
}

/**
 * Trip places of this trip for ids the model passed: a trip place id (what
 * cards carry as `id`) or a place id. Unknown and foreign ids are left out.
 * Returns input id to trip place row.
 */
export async function resolveTripPlaceIds(
  tripId: string,
  ids: string[],
): Promise<Map<string, typeof tripPlaces.$inferSelect>> {
  const uuids = [...new Set(ids.filter(isUuid))];
  if (uuids.length === 0) return new Map();
  const rows = await db
    .select()
    .from(tripPlaces)
    .where(and(eq(tripPlaces.tripId, tripId), or(inArray(tripPlaces.id, uuids), inArray(tripPlaces.placeId, uuids))));
  const out = new Map<string, typeof tripPlaces.$inferSelect>();
  for (const id of ids) {
    const row = rows.find((r) => r.id === id) ?? rows.find((r) => r.placeId === id);
    if (row) out.set(id, row);
  }
  return out;
}
