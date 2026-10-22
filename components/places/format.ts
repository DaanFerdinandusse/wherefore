// Pure helpers for the My places screen: card lines, note quoting, city
// grouping and the page URL. No I/O and no server-only import, so client
// components and tests use them directly.

/** The fields of a saved place these helpers read. */
export type CardFields = {
  city: string;
  primaryType: string | null;
  neighborhood: string | null;
  note: string;
  inTrips: number;
  lastTripTitle: string | null;
  savedAt: Date | string;
  lat: number | null;
  lon: number | null;
};

export const NOTE_MAX_LENGTH = 500;

/**
 * "urn:tag:genre:place:restaurant:seafood" reads "Seafood"; a plain
 * "urn:tag:genre:place:restaurant" reads "Restaurant". Only the provider's own
 * genre, never a guess.
 */
export function placeTypeLabel(primaryType: string | null | undefined): string | null {
  if (!primaryType) return null;
  const leaf = primaryType.split(":").pop()?.replace(/_/g, " ").trim();
  if (!leaf) return null;
  return leaf.charAt(0).toUpperCase() + leaf.slice(1);
}

/** "Seafood · Roma Norte", or whichever half exists. */
export function typeLine(place: Pick<CardFields, "primaryType" | "neighborhood">): string | null {
  const parts = [placeTypeLabel(place.primaryType), place.neighborhood?.trim() || null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** What we store for a note: trimmed, inner whitespace runs kept as typed, capped. */
export function cleanNote(note: string): string {
  return note.replace(/\r\n/g, "\n").trim().slice(0, NOTE_MAX_LENGTH);
}

/**
 * The note in curly quotes, as the cards show it, or null when there is none.
 * Quotes the advisor typed around the note are dropped so they never double.
 */
export function quoteNote(note: string | null | undefined): string | null {
  const text = (note ?? "")
    .trim()
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim();
  return text ? `“${text}”` : null;
}

/** "In 6 trips", "In 1 trip", "Not used yet". */
export function tripsLine(inTrips: number): string {
  if (inTrips <= 0) return "Not used yet";
  return `In ${inTrips} ${inTrips === 1 ? "trip" : "trips"}`;
}

const DAY_MS = 86_400_000;

/** "Saved today", "Saved 3 days ago", "Saved 2 weeks ago", "Saved March 2025". */
export function savedAgo(savedAt: Date | string, now: Date = new Date()): string {
  const saved = new Date(savedAt);
  const days = Math.floor((now.getTime() - saved.getTime()) / DAY_MS);
  if (days <= 0) return "Saved today";
  if (days === 1) return "Saved yesterday";
  if (days < 7) return `Saved ${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `Saved ${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  return `Saved ${saved.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`;
}

/** The right side of a card footer: the last trip it was used for, else when it was saved. */
export function lastUseLine(place: Pick<CardFields, "lastTripTitle" | "savedAt">, now?: Date): string {
  return place.lastTripTitle ? `Last for ${place.lastTripTitle}` : savedAgo(place.savedAt, now);
}

export type CityGroup<T> = { city: string; places: T[] };

/**
 * Places grouped by city, in `order` (the advisor's cities, most places
 * first) and then by name for any city `order` does not list. Cities compare
 * case-insensitively; the first spelling seen names the group. Places keep
 * their order inside a group. A blank city groups under "Other".
 */
export function groupByCity<T extends Pick<CardFields, "city">>(
  places: readonly T[],
  order: readonly string[] = [],
): CityGroup<T>[] {
  const groups = new Map<string, CityGroup<T>>();
  for (const place of places) {
    const name = place.city.trim() || "Other";
    const key = name.toLowerCase();
    const group = groups.get(key) ?? { city: name, places: [] };
    group.places.push(place);
    groups.set(key, group);
  }
  const rank = new Map(order.map((city, i) => [city.trim().toLowerCase(), i]));
  return [...groups.entries()]
    .sort(([a, ga], [b, gb]) => {
      const ra = rank.get(a) ?? Number.POSITIVE_INFINITY;
      const rb = rank.get(b) ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return ga.city.localeCompare(gb.city);
    })
    .map(([, group]) => group);
}

/** The middle of a city's saved places, to bias "Save a place" search toward it. */
export function cityCenter(
  places: readonly Pick<CardFields, "city" | "lat" | "lon">[],
  city: string,
): { lat: number; lon: number } | null {
  const key = city.trim().toLowerCase();
  const points = places.filter(
    (p) => p.city.trim().toLowerCase() === key && typeof p.lat === "number" && typeof p.lon === "number",
  );
  if (points.length === 0) return null;
  const lat = points.reduce((sum, p) => sum + (p.lat as number), 0) / points.length;
  const lon = points.reduce((sum, p) => sum + (p.lon as number), 0) / points.length;
  return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
}

export type PlacesQuery = { city?: string | null; q?: string | null; list?: "mine" | "team" | null };

/** `/places` with only the filters that are set, so "All" is the bare path. */
export function placesHref(query: PlacesQuery): string {
  const params = new URLSearchParams();
  const city = query.city?.trim();
  const q = query.q?.trim();
  if (query.list === "team") params.set("list", "team");
  if (city) params.set("city", city);
  if (q) params.set("q", q);
  const search = params.toString();
  return search ? `/places?${search}` : "/places";
}
