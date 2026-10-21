// The places slice API, written once as types. Two kinds of rows:
//
// - `places`: the shared cache of every place the app has touched, keyed by
//   the provider's entity id. Not owned by anyone; written by the
//   recommendation client through upsertPlaces.
// - `advisor_places` (My places): an advisor's own library with a private
//   note. Owned, so every function takes the caller's scope.

import type { ScopeInput } from "@/lib/auth/scope";
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
  neighborhood: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  imageUrl: string | null;
  /** Trips that have this place as "Your place" (trip_places.advisor_place_id). */
  inTrips: number;
  /** Title of the most recently updated of those trips ("Last for Ana"). */
  lastTripTitle: string | null;
};

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
