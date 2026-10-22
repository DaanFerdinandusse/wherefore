import type { BuiltFrom } from "@/lib/contracts";

// Which entities drive a search for this trip (PLAN 8 step 1). Pure.
//
// - Every traveler with a client profile contributes the favorites that
//   resolved to an entity, in favorite order. Their names feed the
//   explainability shares ("because she loves Via Carota").
// - A traveler without a profile, or with no resolved favorite, is listed as
//   a companion without favorites (the "Built from" box says so).
// - The advisor's own places are extra signals only when the advisor turned
//   on "Blend my taste". They never count as the client's favorites: their
//   share is left out of the drivers so a card never says the client loves a
//   place she has not named.

/** More signals than this only add noise and length to the request. */
export const MAX_SIGNALS = 24;

export type SignalTraveler = {
  name: string;
  clientId: string | null;
  role: string;
};

export type SignalFavorite = {
  clientId: string;
  entityId: string | null;
  name: string;
  match: string;
};

export type TripSignals = {
  /** Entity ids for signal.interests.entities, favorites first. */
  signals: string[];
  /** Named client favorites, for explainability. */
  favorites: { entityId: string; name: string }[];
  favoritesUsed: BuiltFrom["favorites"];
  companionsWithoutFavorites: string[];
  /** Advisor place entity ids added as signals (blend on), else empty. */
  advisorSignals: string[];
};

export function buildSignals(input: {
  travelers: SignalTraveler[];
  favorites: SignalFavorite[];
  advisorPlaceEntityIds?: string[];
  blendMyTaste?: boolean;
}): TripSignals {
  const seen = new Set<string>();
  const signals: string[] = [];
  const favorites: { entityId: string; name: string }[] = [];
  const favoritesUsed: BuiltFrom["favorites"] = [];
  const companionsWithoutFavorites: string[] = [];
  const doneClients = new Set<string>();

  for (const traveler of input.travelers) {
    if (!traveler.clientId) {
      companionsWithoutFavorites.push(traveler.name);
      continue;
    }
    if (doneClients.has(traveler.clientId)) continue;
    doneClients.add(traveler.clientId);
    const own = input.favorites.filter(
      (f) => f.clientId === traveler.clientId && f.entityId && f.match !== "unmatched",
    );
    const names: string[] = [];
    for (const favorite of own) {
      const entityId = favorite.entityId as string;
      if (seen.has(entityId) || signals.length >= MAX_SIGNALS) continue;
      seen.add(entityId);
      signals.push(entityId);
      favorites.push({ entityId, name: favorite.name });
      names.push(favorite.name);
    }
    if (names.length === 0) companionsWithoutFavorites.push(traveler.name);
    else favoritesUsed.push({ clientName: traveler.name, names });
  }

  const advisorSignals: string[] = [];
  if (input.blendMyTaste) {
    for (const entityId of input.advisorPlaceEntityIds ?? []) {
      if (seen.has(entityId) || signals.length >= MAX_SIGNALS) continue;
      seen.add(entityId);
      signals.push(entityId);
      advisorSignals.push(entityId);
    }
  }

  return { signals, favorites, favoritesUsed, companionsWithoutFavorites, advisorSignals };
}

/**
 * Signal scores limited to the client's named favorites, so blended advisor
 * signals never show up as drivers (not even as "Other favorites").
 */
export function favoriteSignalScores<T extends { entityId: string }>(
  signalScores: readonly T[],
  signals: Pick<TripSignals, "advisorSignals">,
): T[] {
  if (signals.advisorSignals.length === 0) return [...signalScores];
  const skip = new Set(signals.advisorSignals);
  return signalScores.filter((s) => !skip.has(s.entityId));
}
