import type { FavoriteTile } from "@/lib/clients/candidates";
import type { FavoriteWithPlace } from "@/lib/clients/contracts";

// The "Places they love" grid as plain data, and the list moves the grid
// makes optimistically before the server confirms. Pure.

export type { FavoriteTile };

export function toFavoriteTile(favorite: FavoriteWithPlace): FavoriteTile {
  const match = favorite.match === "resolved" || favorite.match === "weak" ? favorite.match : "unmatched";
  return {
    id: favorite.id,
    query: favorite.query,
    match,
    name: favorite.place?.name ?? favorite.query,
    city: favorite.place?.city ?? null,
    imageUrl: favorite.place?.imageUrl ?? null,
    candidates: favorite.candidates,
  };
}

/** A favorite shows as a place tile only when it resolved to a place. */
export function isMatched(favorite: Pick<FavoriteTile, "match">): boolean {
  return favorite.match === "resolved";
}

/** Moves the item at `from` to `to` (clamped). Returns a new list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/** Replaces the item with `replaceId` (default: its own id), or appends it when absent. */
export function upsertById<T extends { id: string }>(list: readonly T[], item: T, replaceId: string = item.id): T[] {
  const index = list.findIndex((entry) => entry.id === replaceId);
  if (index === -1) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

export function removeById<T extends { id: string }>(list: readonly T[], id: string): T[] {
  return list.filter((entry) => entry.id !== id);
}

/** Matched favorites: the count that decides "Top taste tags" vs "Their taste so far". */
export function matchedCount(list: readonly Pick<FavoriteTile, "match">[]): number {
  return list.filter(isMatched).length;
}
