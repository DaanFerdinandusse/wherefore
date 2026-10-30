// Scores are evidence from one result set scored against one set of signals
// (the travelers' favorites, plus the advisor's places when blended, plus the
// places in the itinerary at that moment). A
// display score is a rank inside its result set, so two scores from
// different sets do not compare; affinities do, but only when they were
// scored against the same signals. The signal set travels as a short hash
// with every stored affinity (trip_places.signal_hash). Pure.

/** FNV-1a 32 bit, hex. Stable across processes, no crypto needed. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The same ids in any order give the same hash. Empty gives undefined. */
export function signalSetHash(entityIds: readonly string[]): string | undefined {
  const ids = [...new Set(entityIds.filter(Boolean))].sort();
  if (ids.length === 0) return undefined;
  return `s${ids.length}-${fnv1a(ids.join("|"))}`;
}

/** Was a stored affinity scored on this signal set? A row or a set without a hash cannot tell, and counts. */
export function sameSignalSet(rowHash: string | null | undefined, hash: string | undefined): boolean {
  return !hash || !rowHash || rowHash === hash;
}

export type Evidence = {
  affinity?: number | null;
  score?: number | null;
  signalHash?: string | null;
};

/**
 * Does `next` replace `current` as a place's best evidence?
 *  - an affinity beats no affinity;
 *  - scored against a different (newer) signal set, the newer one wins: the
 *    advisor changed the favorites or the itinerary, so old affinities no
 *    longer apply;
 *  - same signal set: the higher affinity wins, never the higher rank;
 *  - neither has an affinity: the higher display score wins (legacy rows).
 * Mirrored in SQL by upsertTripPlaces.
 */
export function beatsEvidence(next: Evidence, current: Evidence): boolean {
  if (next.affinity == null) {
    return current.affinity == null && next.score != null && (current.score == null || next.score > current.score);
  }
  if (current.affinity == null) return true;
  if (next.signalHash && next.signalHash !== current.signalHash) return true;
  return next.affinity > current.affinity;
}
