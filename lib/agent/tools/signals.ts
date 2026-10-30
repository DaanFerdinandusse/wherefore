import type { BuiltFrom, Explainability, MediaFavorite } from "@/lib/contracts";
import type { SignalScore } from "@/lib/qloo/contracts";
import {
  ADVISOR_DRIVER_ID,
  ADVISOR_DRIVER_NAME,
  explainabilityFor,
  isPlainDriver,
  OTHER_FAVORITES_ID,
  TRIP_PICKS_DRIVER_ID,
  TRIP_PICKS_DRIVER_NAME,
} from "@/lib/qloo/normalize";

// Which entities drive a search for this trip (PLAN 8 step 1). Pure.
//
// - Every traveler with a client profile contributes the favorites that
//   resolved to an entity, in favorite order: their places first, then their
//   artists and films. Their names feed the explainability shares ("because
//   Ana loves Khruangbin").
// - A traveler without a profile, or with no resolved favorite of either kind,
//   is listed as a companion without favorites (the "Built from" box says so).
// - The advisor's own places are extra signals only when the advisor turned
//   on "Blend my taste". They never count as the client's favorites: their
//   share is one "Your places" driver entry (driversFor), so a card never
//   says the client loves a place she has not named, and the client's own
//   shares keep their true size.
// - Places already in the itinerary are extra signals too, after everything
//   else and capped, so later searches sharpen as the trip takes shape. The
//   advisor picked them, the client never named them: their share is one
//   "This trip's picks" entry, built the same way. An empty itinerary changes
//   nothing, in the signals or in their hash.

/** More signals than this only add noise and length to the request. */
export const MAX_SIGNALS = 24;
/** Itinerary places among the signals: enough to lean on, never enough to outvote the favorites. */
export const MAX_TRIP_PICK_SIGNALS = 8;
/** Excluded ids go in the request URL, so their number is capped. */
export const MAX_EXCLUDED = 200;

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

/** A client's artists and films, as stored on the client. */
export type SignalMedia = Pick<MediaFavorite, "entityId" | "name" | "query"> & { clientId: string };

export type TripSignals = {
  /** Entity ids for signal.interests.entities, favorites first. */
  signals: string[];
  /** Named client favorites (places, artists, films), for explainability. */
  favorites: { entityId: string; name: string }[];
  favoritesUsed: BuiltFrom["favorites"];
  companionsWithoutFavorites: string[];
  /** Advisor place entity ids added as signals (blend on), else empty. */
  advisorSignals: string[];
  /** Itinerary place entity ids added as signals, else empty. */
  tripPickSignals: string[];
};

export function buildSignals(input: {
  travelers: SignalTraveler[];
  favorites: SignalFavorite[];
  media?: SignalMedia[];
  advisorPlaceEntityIds?: string[];
  blendMyTaste?: boolean;
  /** Entity ids of the places in the itinerary, in trip order. */
  tripPickEntityIds?: string[];
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
    const own = [
      ...input.favorites.flatMap((f) =>
        f.clientId === traveler.clientId && f.entityId && f.match !== "unmatched" ? [{ entityId: f.entityId, name: f.name }] : [],
      ),
      ...(input.media ?? []).flatMap((m) =>
        m.clientId === traveler.clientId && m.entityId ? [{ entityId: m.entityId, name: m.name ?? m.query }] : [],
      ),
    ];
    const names: string[] = [];
    for (const { entityId, name } of own) {
      if (seen.has(entityId) || signals.length >= MAX_SIGNALS) continue;
      seen.add(entityId);
      signals.push(entityId);
      favorites.push({ entityId, name });
      names.push(name);
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

  const tripPickSignals: string[] = [];
  for (const entityId of input.tripPickEntityIds ?? []) {
    if (seen.has(entityId) || signals.length >= MAX_SIGNALS || tripPickSignals.length >= MAX_TRIP_PICK_SIGNALS) continue;
    seen.add(entityId);
    signals.push(entityId);
    tripPickSignals.push(entityId);
  }

  return { signals, favorites, favoritesUsed, companionsWithoutFavorites, advisorSignals, tripPickSignals };
}

/**
 * What a search leaves out, the first list first when the cap bites. The
 * itinerary and the removed places, never a place that was only shown: that
 * one stays available for another slot, and a retried search can find its
 * own results again.
 */
export function searchExclusions(...lists: readonly (readonly string[])[]): string[] {
  return [...new Set(lists.flat().filter(Boolean))].slice(0, MAX_EXCLUDED);
}

/**
 * The signals to score `entityIds` on: an itinerary place is not its own
 * signal, or it would read as a perfect match with itself.
 */
export function signalsForScoring(signals: Pick<TripSignals, "signals" | "tripPickSignals">, entityIds: Iterable<string>): string[] {
  const scored = new Set(entityIds);
  const picks = new Set(signals.tripPickSignals);
  return signals.signals.filter((id) => !(picks.has(id) && scored.has(id)));
}

export {
  ADVISOR_DRIVER_ID,
  ADVISOR_DRIVER_NAME,
  isPlainDriver,
  TRIP_PICKS_DRIVER_ID,
  TRIP_PICKS_DRIVER_NAME,
} from "@/lib/qloo/normalize";

/**
 * A result's drivers ("because they loved"), with blended advisor signals and
 * itinerary picks kept in the denominator: each group's share becomes one
 * plain entry after the named favorites (and before "Other favorites"),
 * `{ entityId: "advisor", name: "Your places" }` and `{ entityId:
 * "trip-picks", name: "This trip's picks" }`, so a client favorite's share is
 * never inflated by leaving them out, and neither group ever reads as
 * something the client loves.
 */
export function driversFor(
  signalScores: readonly SignalScore[],
  signals: Pick<TripSignals, "favorites" | "advisorSignals" | "tripPickSignals">,
): Explainability {
  const advisor = new Set(signals.advisorSignals);
  const picks = new Set(signals.tripPickSignals);
  const merged = signalScores.map((s) =>
    advisor.has(s.entityId)
      ? { entityId: ADVISOR_DRIVER_ID, score: s.score }
      : picks.has(s.entityId)
        ? { entityId: TRIP_PICKS_DRIVER_ID, score: s.score }
        : s,
  );
  const rows = explainabilityFor({ signalScores: merged }, [
    ...signals.favorites.filter((f) => !advisor.has(f.entityId) && !picks.has(f.entityId)),
    ...(advisor.size > 0 ? [{ entityId: ADVISOR_DRIVER_ID, name: ADVISOR_DRIVER_NAME }] : []),
    ...(picks.size > 0 ? [{ entityId: TRIP_PICKS_DRIVER_ID, name: TRIP_PICKS_DRIVER_NAME }] : []),
  ]);
  // explainabilityFor needs one named client favorite: plain entries alone are not a driver list.
  const named = rows.filter((r) => !isPlainDriver(r.entityId));
  if (named.length === 0) return [];
  return [
    ...named,
    ...rows.filter((r) => r.entityId === ADVISOR_DRIVER_ID),
    ...rows.filter((r) => r.entityId === TRIP_PICKS_DRIVER_ID),
    ...rows.filter((r) => r.entityId === OTHER_FAVORITES_ID),
  ];
}
