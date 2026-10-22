import type { BuiltFrom, Explainability } from "@/lib/contracts";
import type { SignalScore } from "@/lib/qloo/contracts";
import { explainabilityFor, OTHER_FAVORITES_ID } from "@/lib/qloo/normalize";

// Which entities drive a search for this trip (PLAN 8 step 1). Pure.
//
// - Every traveler with a client profile contributes the favorites that
//   resolved to an entity, in favorite order. Their names feed the
//   explainability shares ("because she loves Via Carota").
// - A traveler without a profile, or with no resolved favorite, is listed as
//   a companion without favorites (the "Built from" box says so).
// - The advisor's own places are extra signals only when the advisor turned
//   on "Blend my taste". They never count as the client's favorites: their
//   share is one "Your places" driver entry (driversFor), so a card never
//   says the client loves a place she has not named, and the client's own
//   shares keep their true size.

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

/** The one driver entry that holds every blended advisor place: a plain bar, never a favorite. */
export const ADVISOR_DRIVER_ID = "advisor";
export const ADVISOR_DRIVER_NAME = "Your places";

/**
 * A result's drivers ("because they loved"), with blended advisor signals
 * kept in the denominator: their share becomes one `{ entityId: "advisor",
 * name: "Your places" }` entry after the named favorites (and before "Other
 * favorites"), so a client favorite's share is never inflated by leaving the
 * advisor's places out, and the advisor's places never read as something the
 * client loves.
 */
export function driversFor(
  signalScores: readonly SignalScore[],
  signals: Pick<TripSignals, "favorites" | "advisorSignals">,
): Explainability {
  const advisor = new Set(signals.advisorSignals);
  const merged = signalScores.map((s) => (advisor.has(s.entityId) ? { entityId: ADVISOR_DRIVER_ID, score: s.score } : s));
  const rows = explainabilityFor({ signalScores: merged }, [
    ...signals.favorites.filter((f) => !advisor.has(f.entityId)),
    ...(advisor.size > 0 ? [{ entityId: ADVISOR_DRIVER_ID, name: ADVISOR_DRIVER_NAME }] : []),
  ]);
  // explainabilityFor needs one named client favorite: "Your places" alone is not a driver list.
  if (!rows.some((r) => r.entityId !== ADVISOR_DRIVER_ID && r.entityId !== OTHER_FAVORITES_ID)) return [];
  const named = rows.filter((r) => r.entityId !== ADVISOR_DRIVER_ID && r.entityId !== OTHER_FAVORITES_ID);
  return [
    ...named,
    ...rows.filter((r) => r.entityId === ADVISOR_DRIVER_ID),
    ...rows.filter((r) => r.entityId === OTHER_FAVORITES_ID),
  ];
}

/** True for a driver entry that is not one of the client's favorites ("Your places", "Other favorites"). */
export function isPlainDriver(entityId: string): boolean {
  return entityId === ADVISOR_DRIVER_ID || entityId === OTHER_FAVORITES_ID;
}
