import type { EntityType, TypedCandidate } from "./use-entity-search";

// How C2's "Add a place, artist or film" orders its results: places first
// (they drive recommendations), then artists, then films, each kind capped
// so one kind never pushes the others out. Pure.

export const SEARCH_TYPES = ["place", "artist", "movie"] as const satisfies readonly EntityType[];

const SHOWN: Record<EntityType, number> = { place: 4, artist: 2, movie: 2 };

export const GROUP_LABEL: Record<EntityType, string> = { place: "Places", artist: "Artists", movie: "Films" };

export function groupResults(results: readonly TypedCandidate[]): TypedCandidate[] {
  return SEARCH_TYPES.flatMap((type) => results.filter((result) => result.type === type).slice(0, SHOWN[type]));
}
