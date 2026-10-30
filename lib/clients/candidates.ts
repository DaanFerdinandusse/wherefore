import type { FavoriteCandidate, MediaFavorite } from "@/lib/contracts";

// Pure mapping between entity search results and what a favorite stores.
// No server-only import: the profile's picker and the server actions share it.

/** What the entity search returns per result (the fields we read). */
export type SearchCandidate = FavoriteCandidate & { disambiguation?: string };

/** Top results kept on an unmatched favorite, for the "no match" tile. */
export const UNMATCHED_CANDIDATES = 3;

/** The stored shape: only the fields the "no match" tile shows. */
export function toFavoriteCandidate(candidate: SearchCandidate): FavoriteCandidate {
  return {
    entityId: candidate.entityId,
    name: candidate.name,
    ...(candidate.address ? { address: candidate.address } : {}),
    ...(typeof candidate.lat === "number" && typeof candidate.lon === "number"
      ? { lat: candidate.lat, lon: candidate.lon }
      : {}),
    ...(candidate.imageUrl ? { imageUrl: candidate.imageUrl } : {}),
  };
}

/** Candidates for an unmatched favorite: the first few, each entity once. */
export function unmatchedCandidates(results: readonly SearchCandidate[], limit = UNMATCHED_CANDIDATES): FavoriteCandidate[] {
  const seen = new Set<string>();
  const out: FavoriteCandidate[] = [];
  for (const result of results) {
    if (seen.has(result.entityId)) continue;
    seen.add(result.entityId);
    out.push(toFavoriteCandidate(result));
    if (out.length === limit) break;
  }
  return out;
}

/** The second line of a result row: the address, else the disambiguation. */
export function candidateDetail(candidate: SearchCandidate): string {
  return candidate.address?.trim() || candidate.disambiguation?.trim() || "";
}

export type MediaKind = MediaFavorite["kind"];

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  artist: "Artist",
  movie: "Film",
  book: "Book",
};

/** A picked artist or film as stored in media_favorites. */
export function toMediaFavorite(candidate: SearchCandidate, kind: MediaKind, query: string): MediaFavorite {
  return {
    query: query.trim() || candidate.name,
    kind,
    entityId: candidate.entityId,
    name: candidate.name,
    ...(candidate.imageUrl ? { imageUrl: candidate.imageUrl } : {}),
  };
}

/** Adds a media favorite unless the same entity is already there. */
export function addMedia(list: readonly MediaFavorite[], item: MediaFavorite): MediaFavorite[] {
  if (item.entityId && list.some((m) => m.entityId === item.entityId)) return [...list];
  return [...list, item];
}

/** A favorite as the "Places they love" grid draws it. */
export type FavoriteTile = {
  id: string;
  query: string;
  /** The matched entity, null while unmatched. */
  entityId: string | null;
  match: "resolved" | "unmatched" | "weak";
  /** The matched place's name, else what the advisor typed. */
  name: string;
  city: string | null;
  imageUrl: string | null;
  /** The provider's genre urn for the place, null when unknown or unmatched. */
  primaryType: string | null;
  candidates: FavoriteCandidate[];
};

/** Interleaves results of several kinds (artists, films) so each kind shows near the top. */
export function interleave<T>(lists: readonly (readonly T[])[]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list[i];
      if (item !== undefined) out.push(item);
    }
  }
  return out;
}
