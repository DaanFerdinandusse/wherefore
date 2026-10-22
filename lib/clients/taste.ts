import "server-only";

import type { ScopeInput } from "@/lib/auth/scope";
import type { TasteTag } from "@/lib/contracts";
import { tastePortrait } from "@/lib/qloo";

import type { ClientFavorite } from "./contracts";
import { setTasteTags } from "./mutations";
import { listFavorites } from "./queries";

// The client's taste tags: a portrait computed from the favorites that
// resolved to a real place, cached on the client row. The profile calls the
// recompute (debounced) after every favorites change.

/** More signals than this only dilutes the portrait and lengthens the URL. */
export const MAX_TASTE_SIGNALS = 25;

/** Below this many resolved favorites the profile says "Their taste so far". */
export const TASTE_SO_FAR_BELOW = 3;

type SignalSource = Pick<ClientFavorite, "entityId" | "match" | "position">;

/**
 * The entity ids the portrait is computed from: resolved favorites only, in
 * the advisor's order, each once, at most MAX_TASTE_SIGNALS. Pure.
 */
export function tasteSignals(favorites: readonly SignalSource[]): string[] {
  const ordered = [...favorites].sort((a, b) => a.position - b.position);
  const seen = new Set<string>();
  for (const favorite of ordered) {
    if (favorite.match !== "resolved" || !favorite.entityId) continue;
    seen.add(favorite.entityId);
    if (seen.size === MAX_TASTE_SIGNALS) break;
  }
  return [...seen];
}

/**
 * Recomputes and stores the client's taste tags. No resolved favorites
 * clears them. Returns what was stored.
 */
export async function recomputeTasteTags(clientId: string, scope: ScopeInput): Promise<TasteTag[]> {
  const favorites = await listFavorites(clientId, scope);
  const signals = tasteSignals(favorites);
  const { tags } = signals.length > 0 ? await tastePortrait(signals) : { tags: [] };
  const client = await setTasteTags(clientId, tags, scope);
  return client.tasteTags;
}
