import type { Category, TripPlaceSource } from "@/lib/contracts";

import type { TripPlaceUpsert } from "./contracts";

// Pure merge rules for trip places. The same rules run twice: here, to fold
// duplicates inside one upsert call, and in SQL (mutations.ts) against the
// stored row. Keep the two in step.

export const SOURCE_PRIORITY: readonly TripPlaceSource[] = ["seed", "ask", "advisor", "manual"];

export function sourceRank(source: TripPlaceSource): number {
  return SOURCE_PRIORITY.indexOf(source);
}

/** The higher priority source: seed < ask < advisor < manual. */
export function strongerSource(a: TripPlaceSource, b: TripPlaceSource): TripPlaceSource {
  return sourceRank(b) > sourceRank(a) ? b : a;
}

function beats(next: number | null | undefined, current: number | null | undefined): boolean {
  return next != null && (current == null || next > current);
}

/**
 * Fold `next` into `current` for the same place: strongest source, best
 * score (with the explainability and tags of that best set), first known
 * advisor place and reason, and a category that only moves off "other".
 */
export function mergeTripPlace(current: TripPlaceUpsert, next: TripPlaceUpsert): TripPlaceUpsert {
  const better = beats(next.bestScore, current.bestScore);
  const category: Category = current.category === "other" ? next.category : current.category;
  return {
    placeId: current.placeId,
    source: strongerSource(current.source, next.source),
    category,
    bestScore: better ? next.bestScore : current.bestScore,
    bestAffinity: better ? next.bestAffinity : current.bestAffinity,
    explainability: better ? next.explainability : current.explainability,
    sharedTags: better ? next.sharedTags : current.sharedTags,
    advisorPlaceId: next.advisorPlaceId ?? current.advisorPlaceId,
    reason: next.reason ?? current.reason,
    position: current.position ?? next.position,
  };
}

/** One row per place id, merged in input order. */
export function foldTripPlaces(rows: TripPlaceUpsert[]): TripPlaceUpsert[] {
  const byPlace = new Map<string, TripPlaceUpsert>();
  for (const row of rows) {
    const current = byPlace.get(row.placeId);
    byPlace.set(row.placeId, current ? mergeTripPlace(current, row) : row);
  }
  return [...byPlace.values()];
}
