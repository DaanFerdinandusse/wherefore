// The places slice API, written once as types. Two kinds of rows:
//
// - `places`: the shared cache of every place the app has touched, keyed by
//   the provider's entity id. Not owned by anyone; written by the
//   recommendation client through upsertPlaces.
// - `advisor_places` (My places): an advisor's own library with a private
//   note. Owned, so every function takes the caller's scope.

import type { ScopeInput } from "@/lib/auth/scope";
import type { Category } from "@/lib/contracts";
import type { advisorPlaces, places } from "@/lib/db/schema";

export type Place = typeof places.$inferSelect;
/** A normalized place row as the recommendation client builds it. */
export type PlaceUpsert = typeof places.$inferInsert;
export type AdvisorPlace = typeof advisorPlaces.$inferSelect;

/** One card on My places: the saved row, the place it points at, and its use. */
export type AdvisorPlaceRow = {
  id: string;
  placeId: string;
  entityId: string;
  name: string;
  city: string;
  note: string;
  tags: string[];
  savedAt: Date;
  lastUsedAt: Date | null;
  primaryType: string | null;
  /** The provider's category tags (urn:tag:category:place:*). */
  types: string[];
  /** The board category of the place, from its genre and tags (categoryOf). */
  category: Category;
  neighborhood: string | null;
  /** The country the provider geocoded the place to ("Portugal"). */
  country: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  imageUrl: string | null;
  /** Trips that have this place as "Your place" (trip_places.advisor_place_id). */
  inTrips: number;
  /** Title of the most recently updated of those trips. */
  lastTripTitle: string | null;
  /** Client of that trip, for "Last for Ana Ruiz". */
  lastClientName: string | null;
};

/** A trip of the advisor, reduced to what My places says about a city. */
export type CityTrip = {
  tripId: string;
  clientId: string;
  clientName: string;
  /** The destination's locality name, as the advisor's cities store it. */
  city: string;
  /** YYYY-MM-DD, or null while the dates are not set. */
  startDate: string | null;
  endDate: string | null;
};

/** How the advisor's places in one city score for one client. */
export type ClientPlaceScores =
  | { status: "scored"; scores: Record<string, number> }
  | { status: "no-favorites" }
  | { status: "failed" };

export type SaveAdvisorPlaceInput = {
  placeId: string;
  /** Defaults to the place's own city. */
  city?: string | null;
  note?: string;
  tags?: string[];
};

// Place cache

/**
 * Insert or refresh places by entity id; returns `{ [entityId]: placeId }`.
 * Duplicate entity ids in one call merge (later fields win). On refresh a
 * nullable column the new row leaves null keeps its stored value.
 */
export type UpsertPlaces = (rows: PlaceUpsert[]) => Promise<Record<string, string>>;
export type GetPlace = (id: string) => Promise<Place | null>;
export type GetPlacesByEntityIds = (entityIds: string[]) => Promise<Place[]>;

// My places

export type ListAdvisorPlaces = (
  ownerId: ScopeInput,
  options?: { city?: string; q?: string; limit?: number },
) => Promise<AdvisorPlaceRow[]>;
/** The saved row for one place, for the profile's "In my places" toggle. */
export type GetAdvisorPlaceForPlace = (ownerId: ScopeInput, placeId: string) => Promise<AdvisorPlace | null>;
/** Save a place to My places, or update its city and note when already saved. */
export type SaveAdvisorPlace = (ownerId: ScopeInput, input: SaveAdvisorPlaceInput) => Promise<AdvisorPlace>;
export type UpdateAdvisorPlaceNote = (id: string, note: string, scope: ScopeInput) => Promise<AdvisorPlace>;
export type RemoveAdvisorPlace = (id: string, scope: ScopeInput) => Promise<void>;
/** The advisor's cities with how many places each, most first. */
export type AdvisorCities = (ownerId: ScopeInput) => Promise<{ city: string; count: number }[]>;
/** Every trip in scope with its destination city and dates. */
export type ListCityTrips = (scope: ScopeInput) => Promise<CityTrip[]>;
/**
 * Scores saved places (by entity id) for one client's resolved favorites, on
 * the scale of the set itself, so the best fit reads 94. Display scores by
 * entity id; a place the provider did not score has none.
 */
export type ScorePlacesForClient = (
  clientId: string,
  entityIds: string[],
  scope: ScopeInput,
) => Promise<ClientPlaceScores>;
