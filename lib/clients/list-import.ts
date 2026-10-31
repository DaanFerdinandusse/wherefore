import type { NormalizedPlace } from "@/lib/qloo/contracts";
import { haversineM } from "@/lib/qloo/normalize";

// Importing a shared Google Maps list into a client's favorites. A place goes
// in only on an exact match and is left out otherwise: an unsure match would
// put a place the client never named into their taste. Pure, so the profile
// and the server action share it.

/** Places per server action: small enough that the count moves every second or two. */
export const LIST_IMPORT_BATCH = 8;

/**
 * Searches at once. The API allows about 200 a minute and answers 429 past that
 * (tested on a 177 place list: 2 at once lost 13 searches to it, 3 lost 79), and
 * the agent's own searches share the same allowance. So 2, with a wait on a 429.
 */
export const LIST_SEARCHES_AT_ONCE = 2;

/** How far apart the same place can sit in the two data sets. */
export const SAME_SPOT_M = 150;

/** About 100 km: a city and its surroundings count as one area. */
const AREA_DEGREES = 1;

export type ListPlaceRef = { name: string; lat: number; lon: number; googleId: string | null };

/**
 * One place from each area, then a second from each, and so on, keeping the
 * list's order inside an area. Only the first favorites feed the taste tags and
 * the default search, so this keeps them from all coming from one recent trip.
 */
export function spreadByArea<T extends { lat: number; lon: number }>(items: readonly T[]): T[] {
  const areas = new Map<string, T[]>();
  for (const item of items) {
    const key = `${Math.floor(item.lat / AREA_DEGREES)}:${Math.floor(item.lon / AREA_DEGREES)}`;
    const area = areas.get(key);
    if (area) area.push(item);
    else areas.set(key, [item]);
  }
  const queues = [...areas.values()];
  const longest = Math.max(0, ...queues.map((queue) => queue.length));
  const out: T[] = [];
  for (let turn = 0; turn < longest; turn++) {
    for (const queue of queues) {
      const next = queue[turn];
      if (next) out.push(next);
    }
  }
  return out;
}

/** `work` over `items` with at most `limit` running at once, results in the order of `items`. */
export async function mapLimited<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Case, accents and punctuation aside. */
export function sameName(a: string, b: string): boolean {
  const key = (text: string) =>
    text
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return key(a) === key(b);
}

/**
 * The place in `candidates` that is this list entry: the same Google id, else
 * the same name in the same spot (the two data sets can hold one place under
 * two ids). A close name is not a match: nearby places share words.
 */
export function exactMatch(item: ListPlaceRef, candidates: readonly { place?: NormalizedPlace }[]): NormalizedPlace | null {
  const found = candidates.flatMap((candidate) => candidate.place ?? []);
  const byId = item.googleId ? found.find((place) => place.googleCid === item.googleId) : undefined;
  if (byId) return byId;
  return (
    found.find(
      (place) =>
        place.lat !== null &&
        place.lon !== null &&
        sameName(place.name, item.name) &&
        haversineM(item.lat, item.lon, place.lat, place.lon) <= SAME_SPOT_M,
    ) ?? null
  );
}
