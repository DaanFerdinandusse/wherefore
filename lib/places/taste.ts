import "server-only";

import type { AuthUser } from "@/lib/auth/server";
import { updateAdvisor } from "@/lib/auth/advisor";
import type { TasteTag } from "@/lib/contracts";
import { tastePortrait } from "@/lib/qloo";

import { listAdvisorPlaces } from "./queries";

// The advisor's own taste portrait ("Your taste" on My places): the same tag
// portrait a client gets, computed from the advisor's saved places and stored
// on advisors.taste_tags. The My places screen recomputes it a few seconds
// after saves and removals, and on "Refresh".

/** The portrait call takes at most this many input entities. */
export const TASTE_SIGNAL_MAX = 20;

/**
 * The entity ids that feed the portrait: most recently saved first, each id
 * once, at most `max`. Recent saves say the most about the advisor's taste
 * today, and a stable order keeps the cached portrait call reusable.
 */
export function tasteSignalsFor(
  places: readonly { entityId: string; savedAt: Date | string }[],
  max: number = TASTE_SIGNAL_MAX,
): string[] {
  const sorted = [...places].sort((a, b) => {
    const diff = new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
    return diff !== 0 ? diff : a.entityId.localeCompare(b.entityId);
  });
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const place of sorted) {
    const id = place.entityId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= max) break;
  }
  return ids;
}

/**
 * Recompute and store the advisor's taste tags from their own places (not the
 * team's). No places: the tags are cleared without a provider call.
 */
export async function refreshAdvisorTaste(user: AuthUser): Promise<{ tags: TasteTag[]; signalCount: number }> {
  const places = await listAdvisorPlaces(user.userId);
  const signals = tasteSignalsFor(places);
  const { tags } = signals.length > 0 ? await tastePortrait(signals) : { tags: [] as TasteTag[] };
  await updateAdvisor(user.userId, { tasteTags: tags });
  return { tags, signalCount: signals.length };
}
