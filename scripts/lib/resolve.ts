import "server-only";

import type { Destination, FavoriteCandidate, MediaFavorite } from "@/lib/contracts";
import type { LocalitySpec, PlaceSpec } from "@/lib/demo/data";
import { nameMatches, pickLocality } from "@/lib/demo/rules";
import {
  haversineM,
  resolveLocality,
  searchEntities,
  type EntityCandidate,
  type LocalityCandidate,
  type NormalizedPlace,
  type QlooCall,
} from "@/lib/qloo";

// Live lookups for the demo seed, one request at a time (the upstream rate
// limits parallel bursts). Every request also lands in api_cache, so a second
// run is fast. Counts every call for the summary.

/** A search hit further than this from the city it was searched near is someone else's place. */
const MAX_DISTANCE_M = 50_000;
const MEDIA_TYPES = { artist: "urn:entity:artist", movie: "urn:entity:movie", book: "urn:entity:book" } as const;

export type ResolvedPlace = { match: "resolved"; entityId: string; name: string; place: NormalizedPlace };
export type UnmatchedPlace = { match: "unmatched"; candidates: FavoriteCandidate[] };
export type PlaceResolution = ResolvedPlace | UnmatchedPlace;

export type CallStats = { calls: number; cached: number };

export function toDestination(locality: LocalityCandidate): Destination {
  return {
    name: locality.name,
    disambiguation: locality.disambiguation,
    ...(locality.countryCode ? { countryCode: locality.countryCode } : {}),
    lat: locality.lat,
    lon: locality.lon,
    radiusM: locality.radiusM,
    localityEntityId: locality.entityId,
  };
}

function toCandidate(c: EntityCandidate): FavoriteCandidate {
  return {
    entityId: c.entityId,
    name: c.name,
    ...(c.address ? { address: c.address } : {}),
    ...(c.lat !== undefined ? { lat: c.lat } : {}),
    ...(c.lon !== undefined ? { lon: c.lon } : {}),
    ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
  };
}

function isNear(c: EntityCandidate, near: { lat: number; lon: number }): boolean {
  if (c.lat === undefined || c.lon === undefined) return true;
  return haversineM(c.lat, c.lon, near.lat, near.lon) <= MAX_DISTANCE_M;
}

export function createResolver() {
  const stats: CallStats = { calls: 0, cached: 0 };
  const localities = new Map<string, LocalityCandidate>();

  function track(calls: QlooCall[]) {
    for (const call of calls) {
      stats.calls += 1;
      if (call.cached) stats.cached += 1;
    }
  }

  /** The locality the destination picker would store for this spec. */
  async function locality(spec: LocalitySpec): Promise<LocalityCandidate> {
    const key = `${spec.query}|${spec.disambiguationStartsWith ?? ""}`;
    const known = localities.get(key);
    if (known) return known;
    const { candidates, calls } = await resolveLocality(spec.query);
    track(calls);
    const picked = pickLocality(spec, candidates);
    if (!picked) throw new Error(`No locality found for "${spec.query}".`);
    localities.set(key, picked);
    return picked;
  }

  /**
   * The place a name points at near a city: the first hit (in the API's
   * order) that names it and lies within 50 km. Tries `searches` in order.
   * Without one, the favorite is unmatched and keeps the top 3 hits (from
   * anywhere, when nothing came back nearby) for the no-match tile.
   */
  async function place(spec: PlaceSpec, near: { lat: number; lon: number }): Promise<PlaceResolution> {
    let fallback: EntityCandidate[] = [];
    for (const query of spec.searches ?? [spec.name]) {
      const { candidates, calls } = await searchEntities(query, { types: "urn:entity:place", near, take: 5 });
      track(calls);
      const hit = candidates.find(
        (c) => c.place && isNear(c, near) && (nameMatches(spec.name, c.name) || nameMatches(query, c.name)),
      );
      if (hit?.place) return { match: "resolved", entityId: hit.entityId, name: hit.name, place: hit.place };
      if (fallback.length === 0) fallback = candidates;
    }
    if (fallback.length === 0) {
      const { candidates, calls } = await searchEntities(spec.name, { types: "urn:entity:place", take: 3 });
      track(calls);
      fallback = candidates;
    }
    return { match: "unmatched", candidates: fallback.slice(0, 3).map(toCandidate) };
  }

  /** An artist, film or book for "Also into". Unresolved media keep the query only. */
  async function media(query: string, kind: MediaFavorite["kind"]): Promise<MediaFavorite> {
    const { candidates, calls } = await searchEntities(query, { types: MEDIA_TYPES[kind], take: 3 });
    track(calls);
    const hit = candidates.find((c) => nameMatches(query, c.name));
    return hit ? { query, kind, entityId: hit.entityId, name: hit.name } : { query, kind };
  }

  return { stats, track, locality, place, media };
}

export type Resolver = ReturnType<typeof createResolver>;
