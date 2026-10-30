// The recommendation client's public surface, written once as TYPES. api.ts and
// normalize.ts annotate their exports with these, so typecheck fails the moment
// an implementation drifts from what the tools and the UI code against.

import type { Category, Destination, Explainability, FavoriteCandidate, PlaceTag, TasteTag, SlotName, Weekday } from "@/lib/contracts";
import type { places } from "@/lib/db/schema/core";

import type { QlooClient } from "./client";

/** A `places` row, ready for `upsertPlaces(rows)`. Every field maps 1:1 onto
 *  the insert (see the compile-time check at the bottom of this file). */
export type NormalizedPlace = {
  entityId: string;
  name: string;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  lat: number | null;
  lon: number | null;
  /** properties.primary_genre.id, e.g. urn:tag:genre:place:restaurant:italian */
  primaryType: string | null;
  /** The urn:tag:category:place:* tag ids, loosely what the place is. */
  types: string[];
  priceLevel: number | null;
  /** business_rating as numeric(3,2) text, e.g. "4.40". */
  rating: number | null;
  ratingCount: number | null;
  description: string | null;
  images: { url: string; width?: number; height?: number; source?: string }[];
  tags: PlaceTag[];
  /** The raw block the place profile reads: hours, phone, website, keywords,
   *  the long descriptions, specialty dishes, external ratings. */
  properties: Record<string, unknown>;
  googlePlaceId: string | null;
  /** Google CID in decimal (the hex id from the API, converted). */
  googleCid: string | null;
};

/** How much one input entity drove a result, as the API reports it (about 0..1,
 *  summing to about 1 across the inputs). */
export type SignalScore = { entityId: string; score: number };

/** One recommendation: the row to persist plus what ranks and explains it. */
export type PlaceResult = {
  place: NormalizedPlace;
  category: Category;
  /** Null when the search had no signals: nothing was matched to the client. */
  affinity: number | null;
  /** Rank-based 60..94 within this result set (see displayScore). Null with no affinity. */
  score: number | null;
  signalScores: SignalScore[];
  /** Meters from the destination point: the API's distance, or computed from
   *  the coordinates when it gives none. Null without either. */
  distanceM: number | null;
  /** What was dropped to reach this result. Left out for a strict result. */
  loosened?: LoosenedFilter[];
};

/** One request to the upstream, for the "How we got this" panel and trip_calls. */
export type QlooCall = {
  endpoint: string;
  /** Serialized params; id lists cut to 10 with a "+N more" marker. Never the key. */
  params: Record<string, string | string[]>;
  count: number;
  ms: number;
  cached: boolean;
  tripId?: string;
};

/** Optional context every API function takes. */
export type CallContext = {
  /** Stamped on every call record so the caller can `logTripCall(tripId, call)`. */
  tripId?: string;
  /** Overrides the default client (tests, scripts). */
  client?: QlooClient;
};

export type WithCalls<T> = T & { calls: QlooCall[] };

export type LocalityCandidate = {
  entityId: string;
  name: string;
  disambiguation: string;
  lat: number;
  lon: number;
  countryCode?: string;
  /** Suggested search radius from the locality's boundary (meters). */
  radiusM: number;
};

export type EntityCandidate = FavoriteCandidate & {
  disambiguation?: string;
  googlePlaceId?: string;
  googleCid?: string;
  tags: PlaceTag[];
  /** The full row when the entity is a place, so the caller can upsert it. */
  place?: NormalizedPlace;
};

/**
 * What findPlaces did not apply as asked:
 * - "tags": too few results, so filter.tags was dropped.
 * - "popularity": too few less known places, so the popularity cap was dropped.
 * - "michelin": too few Michelin places, so that filter was dropped.
 * - "price": too few results, so the price cap was dropped.
 * - "hours": too few places listed as open that day, so the open day was dropped. Always
 *   the last to go: a closed restaurant is the worst outcome.
 * - "price_not_applicable": a price cap was asked for a see or stay ask
 *   (museums, hotels carry no price level), so it was never applied. The UI
 *   says "Price cap not applied to museums and hotels".
 */
export type LoosenedFilter = "tags" | "popularity" | "michelin" | "price" | "hours" | "price_not_applicable";

export type LocalityCheck = {
  /** What the trip asked for (the destination's disambiguation or name). */
  requested: string;
  /** Where the results actually are: the API's locality when it reports one,
   *  otherwise the most common "city, country" among the results. */
  resolved: string;
  /** False when the results look like they are somewhere else. */
  ok: boolean;
  /** Results dropped for being farther than 1.5x the destination radius. */
  dropped: number;
};

/** A wider circle around the search's point. */
export type WiderCircle = {
  radiusM: number;
  /** Tried only while fewer places than this are found, instead of the usual enough. */
  below?: number;
};

export type FindPlacesInput = {
  destination: Destination;
  /** Wider circles around `destination`, tried in order before any filter is dropped. */
  widen?: WiderCircle[];
  /** Entity ids of the client's favorites (and other input entities). */
  signals: string[];
  /** urn:tag ids, e.g. urn:tag:category:place:wine_bar. */
  tags?: string[];
  /** How several tags combine. Omitted: the upstream default. */
  tagsOperator?: "union" | "intersection";
  excludeIds?: string[];
  priceMax?: number;
  /** Leave out malls and department stores: they carry the tags of what is inside them. */
  noShopping?: boolean;
  /** Keeps to places at or below this popularity (0 to 1). LESS_KNOWN_POPULARITY_MAX for "less known". */
  popularityMax?: number;
  /** Keeps to places the provider links to Michelin. */
  michelin?: boolean;
  /** Keeps to places open on this day. */
  openDay?: Weekday;
  /** With openDay: keeps to places open for part of this slot, by their own hours. */
  openSlot?: SlotName;
  take: number;
  page?: number;
};

export type FindPlacesResult = WithCalls<{
  results: PlaceResult[];
  loosened: LoosenedFilter[];
  localityCheck: LocalityCheck;
  /** The widest circle the search actually ran. */
  radiusM: number;
}>;

export type ScoredEntity = {
  entityId: string;
  name: string;
  affinity: number;
  signalScores: SignalScore[];
  /** Filled when `favorites` is passed, otherwise empty. */
  explainability: Explainability;
  place: NormalizedPlace;
};

export type ScoreEntitiesInput = {
  signals: string[];
  entityIds: string[];
  destination?: Destination;
  /** Names for the signals, to compute explainability shares. */
  favorites?: { entityId: string; name: string }[];
};

export type TagMatch = { tagId: string; name: string; type?: string };

export type DestinationCandidate = {
  entityId: string;
  name: string;
  lat?: number;
  lon?: number;
  countryCode?: string;
  affinity: number;
};

export type ResolveLocality = (name: string, ctx?: CallContext) => Promise<WithCalls<{ candidates: LocalityCandidate[] }>>;
export type SearchEntities = (
  query: string,
  options: { types: string | string[]; near?: { lat: number; lon: number }; take?: number },
  ctx?: CallContext,
) => Promise<WithCalls<{ candidates: EntityCandidate[] }>>;
export type FindPlaces = (input: FindPlacesInput, ctx?: CallContext) => Promise<FindPlacesResult>;
export type ScoreEntities = (
  input: ScoreEntitiesInput,
  ctx?: CallContext,
) => Promise<WithCalls<{ scores: ScoredEntity[] }>>;
export type TastePortrait = (signals: string[], ctx?: CallContext) => Promise<WithCalls<{ tags: TasteTag[] }>>;
export type FindTags = (text: string, ctx?: CallContext) => Promise<WithCalls<{ tags: TagMatch[] }>>;
export type GetEntities = (ids: string[], ctx?: CallContext) => Promise<WithCalls<{ places: NormalizedPlace[] }>>;
export type DestinationsFor = (
  signals: string[],
  countryCode?: string,
  ctx?: CallContext,
) => Promise<WithCalls<{ destinations: DestinationCandidate[] }>>;

// Compile-time check: a NormalizedPlace is a valid `places` insert. Breaks the
// build if a column is renamed or retyped in lib/db/schema/core.ts.
type PlacesInsert = typeof places.$inferInsert;
type AssertAssignable<T extends U, U> = T;
export type NormalizedPlaceIsPlacesInsert = AssertAssignable<NormalizedPlace, PlacesInsert>;
