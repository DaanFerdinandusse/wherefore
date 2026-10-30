// Pure helpers for the Where menu: order the locality candidates, read the
// advisor's place count for a city, and turn a picked candidate into the
// Destination a trip stores.

import type { Destination } from "@/lib/contracts";
import type { PastDestination } from "@/lib/trips/contracts";

/** What GET /api/localities/search returns per candidate. */
export type LocalityCandidate = {
  entityId: string;
  name: string;
  disambiguation: string;
  lat: number;
  lon: number;
  countryCode?: string;
  radiusM: number;
};

export type AdvisorCity = { city: string; count: number };

const CITY_WORDS = /\b(city|municipality|town|village|ciudad|cidade|ville|stadt|comune|municipio)\b/i;

/** Case and accent blind key, so "Lisboa" matches "lisboa" and "Mexico" matches "México". */
export function cityKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

/**
 * Keep the provider's order, except that among candidates sharing a name the
 * one whose disambiguation says city or municipality comes first ("New York"
 * the city before the state). Nothing is dropped: the advisor picks.
 */
export function orderLocalityCandidates<T extends { name: string; disambiguation: string }>(candidates: T[]): T[] {
  const firstIndex = new Map<string, number>();
  candidates.forEach((c, i) => {
    const key = cityKey(c.name);
    if (!firstIndex.has(key)) firstIndex.set(key, i);
  });
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      group: firstIndex.get(cityKey(candidate.name)) ?? index,
      cityRank: CITY_WORDS.test(candidate.disambiguation) ? 0 : 1,
    }))
    .sort((a, b) => a.group - b.group || a.cityRank - b.cityRank || a.index - b.index)
    .map((row) => row.candidate);
}

/** How many of the advisor's places are saved under this city name. */
export function placesInCity(cities: AdvisorCity[], name: string): number {
  const key = cityKey(name);
  return cities.find((c) => cityKey(c.city) === key)?.count ?? 0;
}

/** The stored destination: exactly the name the picker returned. */
export function toDestination(candidate: LocalityCandidate): Destination {
  return {
    name: candidate.name,
    disambiguation: candidate.disambiguation || undefined,
    countryCode: candidate.countryCode,
    lat: candidate.lat,
    lon: candidate.lon,
    radiusM: candidate.radiusM,
    localityEntityId: candidate.entityId,
  };
}

/** A past trip's destination as the new trip stores it, without the trip fields. */
export function storedDestination(past: PastDestination): Destination {
  return {
    name: past.name,
    disambiguation: past.disambiguation,
    countryCode: past.countryCode,
    lat: past.lat,
    lon: past.lon,
    radiusM: past.radiusM,
    localityEntityId: past.localityEntityId,
  };
}
