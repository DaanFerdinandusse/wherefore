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
  scoreEntities,
  sharedTagsFor,
  type NormalizedPlace,
  type QlooCall,
  type ScoredEntity,
  type SignalScore,
} from "@/lib/qloo";
import { addAskPlaces, listTripPlaceCards, upsertTripPlaces, type TripPlaceUpsert } from "@/lib/trips";
import { signalSetHash } from "@/lib/trips/evidence";
import { agentModelRef, agentProviderOptions } from "@/lib/codex/provider";

import { explainPlaces, factSnippets, type ExplainInput } from "../explain";
import { cacheWrite, guarded, writeReasons, type TurnRef } from "../writes";

import { findNamedPlace, type NamedPlace } from "./place-name";
import { driversFor, isPlainDriver } from "./signals";
import type { ToolTrip } from "./trip-data";

// The pieces find_places, seed_trip, score_places and remove_place share:
// writing results as places and trip places, scoring the advisor's own
// places, reading cards back from the database, and the explain step. All
// writes go through the turn guard and are keyed upserts.

/** One place to put on the board, with what ranks and explains it. */
export type BoardItem = {
  place: NormalizedPlace;
  category: Category;
  /** Both null for a place found with no favorites to match against. */
  affinity: number | null;
  score: number | null;
  signalScores: SignalScore[];
  source: TripPlaceSource;
};

/** Drivers: the client's named favorites, blended advisor places as one "Your places" entry (signals.ts). */
export function driversOf(ctx: Pick<ToolTrip, "signals">, signalScores: readonly SignalScore[]): Explainability {
  return driversFor(signalScores, ctx.signals);
}

/** The signal set this trip's searches run on, stored with every affinity (lib/trips/evidence.ts). */
export function signalHashOf(ctx: Pick<ToolTrip, "signals">): string | undefined {
  return signalSetHash(ctx.signals.signals);
}

/** The advisor's saved place id for an entity, if it is one of theirs in this city. */
export function advisorPlaceIdOf(ctx: Pick<ToolTrip, "advisorPlaces">, entityId: string): string | undefined {
  return ctx.advisorPlaces.find((p) => p.entityId === entityId)?.id;
}

function roundedAffinity(affinity: number | null): number | null {
  return affinity === null ? null : Math.round(affinity * 10_000) / 10_000;
}

/** The trip place row for a board item: score, the signal set it was scored on, drivers, shared tags, the advisor link. */
export function tripPlaceRowOf(ctx: ToolTrip, item: BoardItem, placeId: string): TripPlaceUpsert {
  return {
    placeId,
    source: item.source,
    category: item.category,
    bestAffinity: roundedAffinity(item.affinity),
    bestScore: item.score,
    signalHash: signalHashOf(ctx) ?? null,
    explainability: driversOf(ctx, item.signalScores),
    sharedTags: sharedTagsFor(item.place, ctx.tasteTags),
    advisorPlaceId: advisorPlaceIdOf(ctx, item.place.entityId) ?? null,
  };
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
  const placeIds = await cacheWrite(turn, () => upsertPlaces(items.map((i) => i.place)));
  const rows = items.flatMap((item) => {
    const placeId = placeIds[item.place.entityId];
    return placeId ? [tripPlaceRowOf(ctx, item, placeId)] : [];
  });
  const tripPlaceIds = await guarded(turn, (guard) => upsertTripPlaces(turn.tripId, rows, ctx.scope, { turn: guard }));
  const out = new Map<string, string>();
  for (const item of items) {
    const placeId = placeIds[item.place.entityId];
    const tripPlaceId = placeId ? tripPlaceIds[placeId] : undefined;
    if (tripPlaceId) out.set(item.place.entityId, tripPlaceId);
  }
  return out;
}

/**
 * One place of an ask's result set, everything a retry needs to rebuild the
 * tab without searching again (stored in the ask's checkpoint).
 */
export type RankedPlace = {
  tripPlaceId: string;
  entityId: string;
  category: Category;
  affinity: number | null;
  score: number | null;
  explainability: Explainability;
};

export function rankedOf(ctx: Pick<ToolTrip, "signals">, tripPlaceId: string, item: BoardItem): RankedPlace {
  return {
    tripPlaceId,
    entityId: item.place.entityId,
    category: item.category,
    affinity: roundedAffinity(item.affinity),
    score: item.score,
    explainability: driversOf(ctx, item.signalScores),
  };
}

/**
 * The ask tab's whole result set, ranked in the given order (1 = best).
 * Authoritative: ask_places rows of this ask that are not in `ranked` go,
 * so a retried tool call never leaves the first attempt's extra places.
 */
export async function persistAskPlaces(
  turn: TurnRef,
  ctx: ToolTrip,
  askId: string,
  ranked: RankedPlace[],
): Promise<void> {
  await guarded(turn, (guard) =>
    addAskPlaces(
      askId,
      ranked.map((r, index) => ({
        tripPlaceId: r.tripPlaceId,
        rank: index + 1,
        affinity: r.affinity,
        score: r.score,
        explainability: r.explainability,
      })),
      ctx.scope,
      { turn: guard, replace: true },
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

/** The provider's description fields of a place, in the order they are worth reading. */
export const DESCRIPTION_KEYS = [
  "short_description",
  "description",
  "overall_description",
  "ambience_description",
  "cuisine_description",
  "unique_selling_points",
  "neighborhood_description",
  "physical_setting_description",
] as const;

/** Every description text of a places row, the short ones first. Verbatim, nothing added. */
export function descriptionTexts(row: { description: string | null; properties: Record<string, unknown> }): string[] {
  const texts = [
    ...DESCRIPTION_KEYS.map((key) => row.properties[key]),
    row.description,
  ].flatMap((value) => (typeof value === "string" && value.trim() ? [value.trim()] : []));
  return [...new Set(texts)];
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
  const factRows = await db
    .select({ id: places.id, description: places.description, properties: places.properties })
    .from(places)
    .where(inArray(places.id, [...new Set(todo.map((c) => c.placeId))]));
  const factsByPlace = new Map(factRows.map((r) => [r.id, factSnippets(descriptionTexts(r))]));
  const inputs: ExplainInput[] = todo.map((card) => ({
    tripPlaceId: card.tripPlaceId,
    name: card.name,
    category: card.category,
    neighborhood: card.neighborhood,
    because: card.because
      .filter((b) => !isPlainDriver(b.entityId))
      .map((b) => ({ name: b.name, share: b.share, entityId: b.entityId })),
    sharedTags: card.sharedTags.map((t) => t.name),
    facts: factsByPlace.get(card.placeId) ?? [],
    yourPlace: Boolean(card.yourPlace),
  }));
  const ownerOf: Record<string, string> = {};
  for (const used of ctx.signals.favoritesUsed) {
    for (const name of used.names) ownerOf[name] ??= used.clientName;
  }
  const { reasons } = await explainPlaces(
    inputs,
    {
      clientName: ctx.clientName,
      ownerOf,
      properNames: [ctx.destination.name, ...(ctx.destination.disambiguation ? [ctx.destination.disambiguation] : [])],
    },
    { modelRef: agentModelRef(), providerOptions: agentProviderOptions(turn.chatId), abortSignal },
  );
  await writeReasons(
    turn,
    [...reasons.entries()].map(([tripPlaceId, reason]) => ({ tripPlaceId, reason })),
  );
  return reasons;
}

/** A trip place the model pointed at: the row, or every name it could mean. */
export type TripPlaceMatch = NamedPlace<typeof tripPlaces.$inferSelect>;

/**
 * Trip places for what the model passed: an id, or a name (place-name.ts).
 * Returns input to match; anything unknown is left out.
 */
export async function resolveTripPlaceRefs(tripId: string, refs: string[]): Promise<Map<string, TripPlaceMatch>> {
  const out = new Map<string, TripPlaceMatch>();
  const byId = await resolveTripPlaceIds(tripId, refs);
  for (const [ref, row] of byId) out.set(ref, { place: row });
  const names = [...new Set(refs.filter((ref) => !byId.has(ref) && !isUuid(ref)))];
  if (names.length === 0) return out;
  const rows = await db
    .select({ row: tripPlaces, name: places.name })
    .from(tripPlaces)
    .innerJoin(places, eq(places.id, tripPlaces.placeId))
    .where(eq(tripPlaces.tripId, tripId));
  const named = rows.map((r) => ({ ...r, removed: r.row.status === "removed" }));
  for (const name of names) {
    const found = findNamedPlace(name, named);
    if (found?.place) out.set(name, { place: found.place.row });
    else if (found) out.set(name, { matches: found.matches });
  }
  return out;
}

/** Where a trip place is, to search around it. Undefined for an unknown id or name, or a place without coordinates. */
export async function tripPlaceSpot(
  tripId: string,
  id: string,
): Promise<{ lat: number; lon: number; name: string } | undefined> {
  const row = (await resolveTripPlaceRefs(tripId, [id])).get(id)?.place;
  if (!row) return undefined;
  const [place] = await db
    .select({ name: places.name, lat: places.lat, lon: places.lon })
    .from(places)
    .where(eq(places.id, row.placeId))
    .limit(1);
  return place && place.lat !== null && place.lon !== null ? { lat: place.lat, lon: place.lon, name: place.name } : undefined;
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
