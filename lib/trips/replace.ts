import "server-only";

import { and, asc, eq, inArray, isNotNull, ne } from "drizzle-orm";

import { NotFoundError } from "@/lib/auth/errors";
import type { ScopeInput } from "@/lib/auth/scope";
import type { Category, TasteTag, TripPlaceCard } from "@/lib/contracts";
import { db } from "@/lib/db";
import { askPlaces, clientFavorites, clients, places, tripAsks, tripPlaces, tripTravelers } from "@/lib/db/schema";
import { upsertPlaces } from "@/lib/places";
import { findPlaces as defaultFindPlaces, type QlooClient } from "@/lib/qloo";
import type { FindPlaces, PlaceResult } from "@/lib/qloo/contracts";
import { CATEGORY_FILTER_TAGS, categoryOf, displayScore, explainabilityFor, sharedTagsFor } from "@/lib/qloo/normalize";

import { signalSetHash } from "./evidence";
import { asCategory } from "./map";
import { logTripCall, saveReplacement, setTripPlaceStatus } from "./mutations";
import { getTrip, listTripPlaceCards } from "./queries";
import type { TurnGuard } from "./turn-guard";

// "Not for Ana": the removed place makes room for the next best one. The ask
// (or board category) that brought the removed place is asked again with the
// same signals (the client favorites) and every entity already on the trip
// excluded, so a removed place never comes back and nothing doubles. The best
// new place is written as a manual trip place with its score and
// explainability, joins the ask tab the removed place was in, and the calls
// land in the trip's call log for "How we got this". The replacement and its
// link on the removed place are one write (saveReplacement): a repeat with
// the same key returns the same replacement instead of adding another.

const TAKE = 10;

export type ReplacementQuery = {
  tags: string[];
  priceMax?: number;
  /** The ask whose tab the replacement joins, when the removed place came from one. */
  askId?: string;
  /** The rank the removed place had in that tab. */
  rank?: number;
};

type AskMembership = { askId: string; rank: number; query: Record<string, unknown> };

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
}

/**
 * What to ask again: the most recent ask the removed place belongs to when it
 * stored tags, otherwise the board category's filter tags, otherwise the
 * place's own category tag.
 */
export function replacementQuery(input: {
  category: Category;
  placeTypes: readonly string[];
  asks: readonly AskMembership[];
}): ReplacementQuery {
  for (const ask of input.asks) {
    const tags = stringList(ask.query.tags);
    if (tags.length === 0) continue;
    const price = ask.query.priceMax ?? ask.query.price;
    return {
      tags,
      ...(typeof price === "number" && price >= 1 && price <= 4 ? { priceMax: price } : {}),
      askId: ask.askId,
      rank: ask.rank,
    };
  }
  const tags = input.category !== "other" ? CATEGORY_FILTER_TAGS[input.category] : input.placeTypes.slice(0, 1);
  const ask = input.asks[0];
  return { tags: [...tags], ...(ask ? { askId: ask.askId, rank: ask.rank } : {}) };
}

/**
 * The best result that is not on the trip already. The upstream exclusion is
 * trusted but checked: an excluded entity is skipped here too. A result in the
 * removed place's category wins over a better scored one from another group
 * (category filters are loose upstream).
 */
export function pickReplacement(
  results: readonly PlaceResult[],
  excludeIds: readonly string[],
  category: Category,
): PlaceResult | null {
  const excluded = new Set(excludeIds);
  const fresh = results.filter((result) => !excluded.has(result.place.entityId));
  return fresh.find((result) => category === "other" || categoryOf(result.place) === category) ?? fresh[0] ?? null;
}

export type ReplaceDeps = {
  /** Overrides the recommendation client (tests). */
  client?: QlooClient;
  findPlaces?: FindPlaces;
  /** Idempotency key (a tool call id): a repeat with the same key returns the first replacement. */
  key?: string;
  /** An agent turn: every write lands only while it holds the chat (turn-guard.ts). */
  turn?: TurnGuard;
};

/**
 * Marks the trip place removed and adds the next best place in its stead.
 * Returns the new card, or null when nothing new came back (the removal
 * stands either way).
 * @throws NotFoundError when the trip or the trip place is out of scope.
 */
export async function replaceTripPlace(
  tripId: string,
  tripPlaceId: string,
  scope: ScopeInput,
  deps: ReplaceDeps = {},
): Promise<TripPlaceCard | null> {
  const trip = await getTrip(tripId, scope);
  if (!trip) throw new NotFoundError("trip");

  const [removedRows, tripRows, askRows, travelerRows] = await db.batch([
    db
      .select({
        category: tripPlaces.category,
        types: places.types,
        status: tripPlaces.status,
        replacedBy: tripPlaces.replacedBy,
        replacementKey: tripPlaces.replacementKey,
      })
      .from(tripPlaces)
      .innerJoin(places, eq(places.id, tripPlaces.placeId))
      .where(and(eq(tripPlaces.id, tripPlaceId), eq(tripPlaces.tripId, tripId)))
      .limit(1),
    db
      .select({ entityId: places.entityId, affinity: tripPlaces.bestAffinity })
      .from(tripPlaces)
      .innerJoin(places, eq(places.id, tripPlaces.placeId))
      .where(eq(tripPlaces.tripId, tripId)),
    db
      .select({ askId: askPlaces.askId, rank: askPlaces.rank, query: tripAsks.query })
      .from(askPlaces)
      .innerJoin(tripAsks, eq(tripAsks.id, askPlaces.askId))
      .where(and(eq(askPlaces.tripPlaceId, tripPlaceId), ne(tripAsks.status, "archived")))
      .orderBy(asc(tripAsks.createdAt)),
    db
      .select({ clientId: tripTravelers.clientId })
      .from(tripTravelers)
      .where(and(eq(tripTravelers.tripId, tripId), eq(tripTravelers.drivesSearch, true), isNotNull(tripTravelers.clientId))),
  ]);
  const removed = removedRows[0];
  if (!removed) throw new NotFoundError("trip place");

  // A repeat of the same replacement (same key): the first one comes back.
  if (deps.key && removed.replacedBy && removed.replacementKey === deps.key) {
    const [card] = await listTripPlaceCards(tripId, scope, { tripPlaceIds: [removed.replacedBy] });
    return card ?? null;
  }

  if (removed.status !== "removed") await setTripPlaceStatus(tripPlaceId, "removed", scope, { turn: deps.turn });

  // Same signals as the board: the favorites of the travelers who drive the search.
  const clientIds = [...new Set([trip.clientId, ...travelerRows.flatMap((t) => (t.clientId ? [t.clientId] : []))])];
  const [favoriteRows, clientRows] = await db.batch([
    db
      .select({ entityId: clientFavorites.entityId, query: clientFavorites.query, placeName: places.name })
      .from(clientFavorites)
      .leftJoin(places, eq(places.id, clientFavorites.placeId))
      .where(and(inArray(clientFavorites.clientId, clientIds), isNotNull(clientFavorites.entityId)))
      .orderBy(asc(clientFavorites.position)),
    db.select({ id: clients.id, tasteTags: clients.tasteTags }).from(clients).where(eq(clients.id, trip.clientId)),
  ]);
  const favorites = uniqueFavorites(favoriteRows);
  const tasteTags: TasteTag[] = clientRows[0]?.tasteTags ?? [];

  const category = asCategory(removed.category);
  const query = replacementQuery({
    category,
    placeTypes: removed.types,
    asks: askRows.map((row) => ({ askId: row.askId, rank: row.rank, query: row.query })),
  });
  const excludeIds = [...new Set(tripRows.map((row) => row.entityId))];

  const find = deps.findPlaces ?? defaultFindPlaces;
  const found = await find(
    {
      destination: trip.destination,
      signals: favorites.map((f) => f.entityId),
      tags: query.tags,
      tagsOperator: query.tags.length > 1 ? "union" : undefined,
      excludeIds,
      priceMax: query.priceMax,
      take: TAKE,
    },
    { tripId, client: deps.client },
  );

  const source = query.askId ? `ask:${query.askId}` : "profile";
  for (const [index, call] of found.calls.entries()) {
    await logTripCall(
      tripId,
      {
        endpoint: call.endpoint,
        params: call.params,
        count: call.count,
        ms: call.ms,
        loosened: found.loosened,
        source,
        ...(deps.key ? { key: { toolCallId: deps.key, step: "replace", index } } : {}),
      },
      scope,
      { turn: deps.turn },
    );
  }

  const best = pickReplacement(found.results, excludeIds, category);
  if (!best) return null;

  const placeIds = await upsertPlaces([best.place]);
  const placeId = placeIds[best.place.entityId];
  if (!placeId) return null;

  // Score against the trip's own set, so the replacement reads in line with
  // the cards around it rather than as the top of a one-off query.
  const tripAffinities = tripRows.flatMap((row) => (typeof row.affinity === "number" ? [row.affinity] : []));
  const score = tripAffinities.length > 0 ? displayScore(best.affinity, [...tripAffinities, best.affinity]) : best.score;
  const explainability = explainabilityFor(best, favorites);

  const newTripPlaceId = await saveReplacement(
    tripId,
    {
      removedTripPlaceId: tripPlaceId,
      key: deps.key ?? null,
      place: {
        placeId,
        source: "manual",
        category: categoryOf(best.place) === "other" ? category : categoryOf(best.place),
        bestAffinity: best.affinity,
        bestScore: score,
        signalHash: signalSetHash(favorites.map((f) => f.entityId)) ?? null,
        explainability,
        sharedTags: sharedTagsFor(best.place, tasteTags),
      },
      ...(query.askId
        ? { ask: { askId: query.askId, rank: query.rank ?? 0, affinity: best.affinity, score, explainability } }
        : {}),
    },
    scope,
    { turn: deps.turn },
  );
  if (!newTripPlaceId) return null;

  const [card] = await listTripPlaceCards(tripId, scope, { tripPlaceIds: [newTripPlaceId] });
  return card ?? null;
}

function uniqueFavorites(rows: { entityId: string | null; query: string; placeName: string | null }[]) {
  const seen = new Set<string>();
  const out: { entityId: string; name: string }[] = [];
  for (const row of rows) {
    if (!row.entityId || seen.has(row.entityId)) continue;
    seen.add(row.entityId);
    out.push({ entityId: row.entityId, name: row.placeName ?? row.query });
  }
  return out;
}
