// The recommendation client's public surface, written once as TYPES. api.ts and
// normalize.ts annotate their exports with these, so typecheck fails the moment
// an implementation drifts from what the tools and the UI code against.

import type { Category, Destination, Explainability, FavoriteCandidate, PlaceTag, TasteTag } from "@/lib/contracts";
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
  affinity: number;
  /** Rank-based 60..94 within this result set (see displayScore). */
  score: number;
  signalScores: SignalScore[];
  distanceM: number | null;
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

export type LoosenedFilter = "tags" | "price";

export type LocalityCheck = {
  /** What the trip asked for (the destination's disambiguation or name). */
  requested: string;
  /** Where the results actually are: the API's locality when it reports one,
   *  otherwise the most common "city, country" among the results. */
  resolved: string;
  /** False when the results look like they are somewhere else. */
  ok: boolean;
};

export type FindPlacesInput = {
  destination: Destination;
  /** Entity ids of the client's favorites (and other input entities). */
  signals: string[];
  /** urn:tag ids, e.g. urn:tag:category:place:wine_bar. */
  tags?: string[];
  /** How several tags combine. Omitted: the upstream default. */
  tagsOperator?: "union" | "intersection";
  excludeIds?: string[];
  priceMax?: number;
  take: number;
  page?: number;
};

export type FindPlacesResult = WithCalls<{
  results: PlaceResult[];
  loosened: LoosenedFilter[];
  localityCheck: LocalityCheck;
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
