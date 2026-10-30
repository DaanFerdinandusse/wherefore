// Pure mapping from upstream shapes to the app's: the `places` row, the board
// category, the card score and the "because they loved" shares. No I/O, so the
// UI can import it too (it never names the provider).

import type { Category, Destination, Explainability, PlaceTag, SlotName, TasteTag, Weekday } from "@/lib/contracts";

import type { LocalityCandidate, LocalityCheck, NormalizedPlace, PlaceResult, SignalScore } from "./contracts";
import type { RawLocality, RawPlace } from "./types";

// --------------------------------------------------------- less known, open day

/** "Less known" means a popularity percentile (0 to 1) below this. The search filter and the card chip share it. */
export const LESS_KNOWN_POPULARITY_MAX = 0.6;

/** An unknown popularity is not less known. */
export function isLessKnown(popularity: number | undefined): boolean {
  return popularity !== undefined && popularity < LESS_KNOWN_POPULARITY_MAX;
}

/** The hours block's keys and the values filter.hours takes. */
export const WEEKDAY_NAMES: readonly Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Does a place's own hours block say closed on this day? No hours for the day is not closed. */
export function closedOn(hours: unknown, day: Weekday): boolean {
  if (!hours || typeof hours !== "object") return false;
  const spans = (hours as Record<string, unknown>)[day];
  return Array.isArray(spans) && spans.length > 0 && spans.every((span) => (span as { closed?: unknown } | null)?.closed === true);
}

// The hours a slot covers, in minutes from midnight. A guide for "open for
// the slot", not a booking time: the place only has to be open for part of it.
export const SLOT_WINDOWS: Record<SlotName, [number, number] | null> = {
  morning: [9 * 60, 12 * 60],
  lunch: [12 * 60, 15 * 60],
  afternoon: [14 * 60, 18 * 60],
  dinner: [19 * 60, 22 * 60],
  night: [21 * 60, 25 * 60],
  stay: null,
};

/** "T19:30:00" in minutes from midnight. */
function spanMinutes(time: unknown): number | null {
  const match = typeof time === "string" ? /^T?(\d{2}):(\d{2})/.exec(time) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Does a place's own hours block have it open for part of this slot? Reads
 * every span of the day, so it needs hours from /entities: /v2/insights lists
 * only the first one. Unknown hours, or a time that does not read, do not count
 * against a place.
 */
export function openDuring(hours: unknown, day: Weekday, slot: SlotName): boolean {
  const window = SLOT_WINDOWS[slot];
  if (!window || !hours || typeof hours !== "object") return true;
  const spans = (hours as Record<string, unknown>)[day];
  if (!Array.isArray(spans) || spans.length === 0) return true;
  return spans.some((span) => {
    const { closed, opens, closes } = (span ?? {}) as { closed?: unknown; opens?: unknown; closes?: unknown };
    if (closed === true) return false;
    const from = spanMinutes(opens);
    const to = spanMinutes(closes);
    if (from === null || to === null) return true;
    return from < window[1] && (to <= from ? to + 24 * 60 : to) > window[0];
  });
}

// ---------------------------------------------------------------- places row

/** Keys of the raw properties block the place profile reads. Everything else
 *  (localities, akas, parking flags) is dropped before it reaches the row. */
const PROFILE_KEYS = [
  "hours",
  "phone",
  "website",
  "menu_url",
  "keywords",
  "description",
  "short_description",
  "overall_description",
  "cuisine_description",
  "ambience_description",
  "service_description",
  "amenities_description",
  "unique_selling_points",
  "neighborhood_description",
  "physical_setting_description",
  "customer_demographics_description",
  "specialty_dishes",
  "good_for",
  "primary_genre",
  "price_range",
  "hotel_class",
  "star_rating",
  "number_of_rooms",
  "check_in_time",
  "check_out_time",
  "business_rating",
  "is_closed",
  "geocode",
] as const;

const CATEGORY_TAG_TYPE = "urn:tag:category:place";

/**
 * One upstream place (from /search, /entities or /v2/insights) as a `places`
 * insert. Handles both homes of the Google ids: `properties.external.google_place`
 * (an object, in /search and /entities) and top-level `external.google_place`
 * (an array, in /v2/insights).
 */
export function normalizePlace(raw: RawPlace): NormalizedPlace {
  const p = raw.properties ?? {};
  const google = googleIdsOf(raw);
  const tags = normalizeTags(raw.tags ?? []);
  const external = raw.external ?? p.external ?? null;

  const properties: Record<string, unknown> = {};
  const loose = p as Record<string, unknown>;
  for (const key of PROFILE_KEYS) {
    const value = loose[key];
    if (value !== null && value !== undefined) properties[key] = value;
  }
  if (external) properties.external = external;
  const popularity = (raw as Record<string, unknown>).popularity;
  if (typeof popularity === "number") properties.popularity = popularity;

  return {
    entityId: raw.entity_id,
    name: raw.name.trim(),
    address: clean(p.address) ?? clean(raw.disambiguation),
    city: clean(p.geocode?.city),
    neighborhood: clean(p.neighborhood) ?? clean(p.geocode?.name),
    lat: raw.location?.lat ?? null,
    lon: raw.location?.lon ?? null,
    primaryType: p.primary_genre?.id ?? null,
    types: tags.filter((t) => t.type === CATEGORY_TAG_TYPE).map((t) => t.tagId),
    priceLevel: priceLevelOf(p.price_level),
    rating: typeof p.business_rating === "number" ? Math.round(p.business_rating * 100) / 100 : null,
    // business_rating comes without a count; the external counts (Tripadvisor,
    // Resy) rate something else, so they stay in properties.external.
    ratingCount: null,
    description: clean(p.short_description) ?? clean(p.description),
    images: imagesOf(p),
    tags,
    properties,
    googlePlaceId: google.placeId,
    googleCid: google.cid,
  };
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function priceLevelOf(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4 ? value : null;
}

function imagesOf(p: NonNullable<RawPlace["properties"]>): NormalizedPlace["images"] {
  const urls = [...(p.images ?? []).map((i) => i.url), ...(p.image ? [p.image.url] : [])];
  return [...new Set(urls.filter(Boolean))].map((url) => ({ url, source: "provider" }));
}

export function normalizeTags(raw: NonNullable<RawPlace["tags"]>): PlaceTag[] {
  const seen = new Set<string>();
  const out: PlaceTag[] = [];
  for (const tag of raw) {
    const tagId = tag.tag_id ?? tag.id;
    const name = tag.name?.trim();
    if (!tagId || !name || seen.has(tagId)) continue;
    seen.add(tagId);
    out.push(tag.type ? { tagId, name, type: tag.type } : { tagId, name });
  }
  return out;
}

/** Google Places id and CID (decimal) from either shape of `google_place`. */
export function googleIdsOf(raw: RawPlace): { placeId: string | null; cid: string | null } {
  const refs = [raw.external?.google_place, raw.properties?.external?.google_place].flatMap((ref) =>
    ref ? (Array.isArray(ref) ? ref : [ref]) : [],
  );
  const ref = refs.find((r) => r.place_id) ?? refs[0];
  return { placeId: ref?.place_id ?? null, cid: ref?.id ? cidFromHex(ref.id) : null };
}

/** The API's `google_place.id` is the Google CID in hex. */
export function cidFromHex(hex: string): string | null {
  return /^[0-9a-f]{1,16}$/i.test(hex) ? BigInt(`0x${hex}`).toString() : null;
}

export function cidToHex(cid: string): string | null {
  return /^\d{1,20}$/.test(cid) ? BigInt(cid).toString(16) : null;
}

/** Per-input scores of one insights result, in the API's order. */
export function signalScoresOf(raw: RawPlace): SignalScore[] {
  return (raw.query?.explainability?.["signal.interests.entities"] ?? []).map((e) => ({
    entityId: e.entity_id,
    score: e.score,
  }));
}

// ------------------------------------------------------------------ category

const GENRE_PREFIX = "urn:tag:genre:place:";

const STAY_LEAVES = new Set([
  "hotel",
  "hostel",
  "resort",
  "motel",
  "inn",
  "lodge",
  "guest_house",
  "bed_and_breakfast",
  "boutique_hotel",
  "aparthotel",
  "ryokan",
  "lodging",
]);
const COFFEE_LEAVES = new Set([
  "cafe",
  "coffee_shop",
  "coffee_roastery",
  "coffee_bar",
  "espresso_bar",
  "bakery",
  "patisserie",
  "pastry_shop",
  "cake_shop",
  "donut_shop",
  "tea_house",
  "tea_room",
  "chocolate_artisan",
  "chocolate_shop",
  "juice_bar",
]);
const DRINK_LEAVES = new Set([
  "bar",
  "pub",
  "brewery",
  "brewpub",
  "taproom",
  "speakeasy",
  "lounge",
  "night_club",
  "nightclub",
  "beer_hall",
  "beer_garden",
  "natural_wine",
]);
/** "_bar" leaves that are places to eat (or coffee, handled above). */
const FOOD_BARS = new Set([
  "tapas_bar",
  "oyster_bar",
  "sushi_bar",
  "raw_bar",
  "salad_bar",
  "snack_bar",
  "dessert_bar",
  "noodle_bar",
  "ramen_bar",
  "poke_bar",
]);
const SEE_PATTERN =
  /(museum|gallery|landmark|monument|attraction|park|garden|church|cathedral|basilica|chapel|monastery|convent|palace|castle|fortress|viewpoint|miradouro|theater|theatre|aquarium|zoo|historic|cultural_center|library|ruins)/;

function categoryOfLeaf(leaf: string): Category | undefined {
  if (STAY_LEAVES.has(leaf) || leaf.endsWith("_hotel") || leaf.endsWith("_resort")) return "stay";
  if (COFFEE_LEAVES.has(leaf)) return "coffee";
  if (DRINK_LEAVES.has(leaf)) return "drink";
  if (leaf.endsWith("_bar") && !FOOD_BARS.has(leaf)) return "drink";
  if (SEE_PATTERN.test(leaf)) return "see";
  return undefined;
}

/**
 * Board category. The primary genre decides; the category tags only break the
 * tie when there is no genre. Category filters upstream are loose (restaurants
 * come back under cocktail_bar, a beer restaurant under museum), so every
 * filtered result is re-checked here before it lands in a group: a place whose
 * genre is plain "restaurant" stays in "eat" whatever its tags say.
 */
export function categoryOf(place: Pick<NormalizedPlace, "primaryType" | "types">): Category {
  const genre = place.primaryType?.startsWith(GENRE_PREFIX) ? place.primaryType.slice(GENRE_PREFIX.length) : null;
  if (genre) {
    const segments = genre.split(":");
    const leaf = segments[segments.length - 1];
    const byLeaf = categoryOfLeaf(leaf);
    if (byLeaf) return byLeaf;
    if (segments[0] === "restaurant") return "eat";
    if (segments.some((s) => STAY_LEAVES.has(s))) return "stay";
  }

  // No usable genre: fall back to the category tags, restaurants first so a
  // restaurant with a bar is still a place to eat.
  const leaves = place.types.map((t) => t.slice(t.lastIndexOf(":") + 1));
  const has = (test: (leaf: string) => boolean) => leaves.some(test);
  if (has((l) => STAY_LEAVES.has(l) || l.endsWith("_hotel"))) return "stay";
  if (has((l) => l === "restaurant" || l.endsWith("_restaurant"))) return "eat";
  if (has((l) => COFFEE_LEAVES.has(l))) return "coffee";
  if (has((l) => DRINK_LEAVES.has(l) || (l.endsWith("_bar") && !FOOD_BARS.has(l)))) return "drink";
  if (has((l) => SEE_PATTERN.test(l))) return "see";
  return "other";
}

/**
 * True when every tag is a see or stay category (museum, hotel, attraction).
 * Those places carry no price_level, and the upstream drops them under any
 * price filter, so findPlaces does not apply a price cap to such an ask.
 */
export function isUnpricedTagFilter(tags: readonly string[]): boolean {
  if (tags.length === 0) return false;
  return tags.every((tag) => {
    const prefix = tag.startsWith("urn:tag:category:place:") || tag.startsWith(GENRE_PREFIX);
    if (!prefix) return false;
    const category = categoryOfLeaf(tag.slice(tag.lastIndexOf(":") + 1));
    return category === "see" || category === "stay";
  });
}

/** Category filters that fetch a board group. Union, then re-checked with categoryOf. */
export const CATEGORY_FILTER_TAGS: Record<Exclude<Category, "other">, string[]> = {
  eat: ["urn:tag:category:place:restaurant"],
  drink: [
    "urn:tag:category:place:cocktail_bar",
    "urn:tag:category:place:wine_bar",
    "urn:tag:category:place:bar",
  ],
  coffee: ["urn:tag:category:place:cafe", "urn:tag:category:place:coffee_shop"],
  see: ["urn:tag:category:place:museum", "urn:tag:category:place:tourist_attraction"],
  stay: ["urn:tag:category:place:hotel"],
};

/** True when every tag is a category filter: the ask names a kind of place and nothing more specific. */
export function isCategoryTagFilter(tags: readonly string[]): boolean {
  const known = new Set(Object.values(CATEGORY_FILTER_TAGS).flat());
  return tags.length > 0 && tags.every((tag) => known.has(tag));
}

// --------------------------------------------------------------------- score

export const SCORE_TOP = 94;
export const SCORE_BOTTOM = 60;

/**
 * Card score, rank-based within the result set: the best affinity gets 94, the
 * worst 60, evenly spaced by rank between them, ties share a score. Raw
 * affinities bunch at 0.79 to 0.80, so the decimal itself would read as "all
 * the same". An affinity below the whole set (a weak "Your place") keeps going
 * down one step per rank, so it reads lower than every pick.
 */
export function displayScore(affinity: number, setAffinities: readonly number[]): number {
  const distinct = [...new Set(setAffinities)].sort((a, b) => b - a);
  if (distinct.length === 0) return SCORE_TOP;
  const rank = distinct.filter((a) => a > affinity + 1e-12).length;
  const step = distinct.length > 1 ? (SCORE_TOP - SCORE_BOTTOM) / (distinct.length - 1) : SCORE_TOP - SCORE_BOTTOM;
  return Math.max(1, Math.round(SCORE_TOP - rank * step));
}

// ------------------------------------------------------------ explainability

/** Entity id of the one entry that holds every driver without a name. */
export const OTHER_FAVORITES_ID = "other";
export const OTHER_FAVORITES_NAME = "Other favorites";
/** The one driver entry that holds every blended advisor place: a plain bar, never a favorite. */
export const ADVISOR_DRIVER_ID = "advisor";
export const ADVISOR_DRIVER_NAME = "Your places";
/** The one driver entry that holds every place already in the itinerary: a plain bar, never a favorite. */
export const TRIP_PICKS_DRIVER_ID = "trip-picks";
export const TRIP_PICKS_DRIVER_NAME = "This trip's picks";

/** True for a driver entry that is not one of the client's favorites ("Your places", "This trip's picks", "Other favorites"). */
export function isPlainDriver(entityId: string): boolean {
  return entityId === ADVISOR_DRIVER_ID || entityId === TRIP_PICKS_DRIVER_ID || entityId === OTHER_FAVORITES_ID;
}

/**
 * The favorites a place is credited to by name, for every "Because Ana
 * loves ..." sentence: never "Your places", "This trip's picks" or "Other
 * favorites", never a driver without a name.
 */
export function favoriteDrivers<T extends { entityId: string; name: string }>(because: readonly T[]): T[] {
  return because.filter((d) => !isPlainDriver(d.entityId) && d.name.trim().length > 0);
}

/**
 * "Because they loved": each favorite's share of one result, as integer
 * percentages that sum to exactly 100 (largest remainder rounding), biggest
 * first. Inputs that are not in `favorites` (no name to show) are never
 * rescaled away: together they become one "Other favorites" entry, listed
 * last, so a named share is never inflated. Empty when no driver has a name,
 * or when the API returned no explainability (for example with tag signals
 * only).
 */
export function explainabilityFor(
  result: { signalScores: readonly SignalScore[] },
  favorites: readonly { entityId: string; name: string }[],
): Explainability {
  const names = new Map(favorites.map((f) => [f.entityId, f.name]));
  const merged = new Map<string, number>();
  let unnamed = 0;
  for (const { entityId, score } of result.signalScores) {
    if (!(score > 0)) continue;
    if (names.has(entityId)) merged.set(entityId, (merged.get(entityId) ?? 0) + score);
    else unnamed += score;
  }
  if (merged.size === 0) return [];
  const total = [...merged.values()].reduce((sum, s) => sum + s, 0) + unnamed;

  const toRow = (entityId: string, score: number) => {
    const exact = (score / total) * 100;
    return { entityId, exact, share: Math.floor(exact) };
  };
  const rows = [...merged.entries()].map(([entityId, score]) => toRow(entityId, score));
  const other = unnamed > 0 ? toRow(OTHER_FAVORITES_ID, unnamed) : undefined;
  const all = other ? [...rows, other] : rows;
  let left = 100 - all.reduce((sum, r) => sum + r.share, 0);
  for (const row of [...all].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))) {
    if (left <= 0) break;
    row.share += 1;
    left -= 1;
  }
  const named = rows
    .sort((a, b) => b.share - a.share || b.exact - a.exact)
    .map(({ entityId, share }) => ({ entityId, name: names.get(entityId) ?? "", share }));
  return other && other.share > 0
    ? [...named, { entityId: OTHER_FAVORITES_ID, name: OTHER_FAVORITES_NAME, share: other.share }]
    : named;
}

/**
 * The client's taste tags this place carries, in the portrait's order. Matches
 * on tag id, or on name across tag families (the portrait's "Cozy" is an
 * ambience tag, the place may carry the decor one).
 */
export function sharedTagsFor(place: { tags: readonly PlaceTag[] }, clientTasteTags: readonly TasteTag[]): TasteTag[] {
  const ids = new Set(place.tags.map((t) => t.tagId));
  const names = new Set(place.tags.map((t) => t.name.toLowerCase()));
  const seen = new Set<string>();
  const out: TasteTag[] = [];
  for (const tag of clientTasteTags) {
    const name = tag.name.toLowerCase();
    if (seen.has(name)) continue;
    if (ids.has(tag.tagId) || names.has(name)) {
      seen.add(name);
      out.push(tag);
    }
  }
  return out;
}

// ------------------------------------------------------------------ locality

export const DEFAULT_RADIUS_M = 8000;
const MIN_RADIUS_M = 2000;
const MAX_RADIUS_M = 25_000;

/** Search radius for a locality: half the diagonal of its boundary's bounding
 *  box, clamped to 2 to 25 km; 8 km when there is no boundary. */
export function radiusFromBoundary(boundary: string | null | undefined): number {
  if (!boundary) return DEFAULT_RADIUS_M;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const match of boundary.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) {
    const lon = Number(match[1]);
    const lat = Number(match[2]);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLon)) return DEFAULT_RADIUS_M;
  const half = haversineM(minLat, minLon, maxLat, maxLon) / 2;
  const rounded = Math.round(half / 500) * 500;
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, rounded));
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

let countryCodes: Map<string, string> | undefined;

/** ISO code for an English country name ("Portugal" -> "PT"), from Intl. */
export function countryCodeFor(name: string): string | undefined {
  if (!countryCodes) {
    countryCodes = new Map();
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const label = names.of(code);
        if (label && label !== code) countryCodes.set(label.toLowerCase(), code);
      }
    }
    countryCodes.set("united states of america", "US");
  }
  return countryCodes.get(name.trim().toLowerCase());
}

export function normalizeLocality(raw: RawLocality): LocalityCandidate {
  const country = raw.properties?.ancestors?.find((a) => a.place === "country")?.name;
  const countryCode = country ? countryCodeFor(country) : undefined;
  return {
    entityId: raw.entity_id,
    name: raw.name,
    disambiguation: raw.disambiguation?.trim() || raw.name,
    lat: raw.location.lat,
    lon: raw.location.lon,
    ...(countryCode ? { countryCode } : {}),
    radiusM: radiusFromBoundary(raw.properties?.boundaries),
  };
}

// ------------------------------------------------------------ locality check

export function countryCodeOfPlace(result: PlaceResult): string | undefined {
  const geocode = result.place.properties.geocode;
  if (typeof geocode !== "object" || geocode === null) return undefined;
  const code = (geocode as Record<string, unknown>).country_code;
  return typeof code === "string" ? code.toUpperCase() : undefined;
}

function countryNameOfPlace(result: PlaceResult): string | undefined {
  const geocode = result.place.properties.geocode;
  if (typeof geocode !== "object" || geocode === null) return undefined;
  const name = (geocode as Record<string, unknown>).country;
  return typeof name === "string" ? name : undefined;
}

/** Results farther than this many destination radii are dropped. */
export const MAX_DISTANCE_FACTOR = 1.5;
/** checkLocality wants 80% of the kept results within this many radii. */
const NEAR_FACTOR = 1.25;

/**
 * Meters from the destination point: the API's own `query.distance` when it
 * reports one, otherwise the haversine distance from the place's coordinates.
 * Null when there is neither.
 */
export function distanceFromDestination(
  destination: Pick<Destination, "lat" | "lon">,
  place: Pick<NormalizedPlace, "lat" | "lon">,
  apiDistanceM?: number | null,
): number | null {
  if (typeof apiDistanceM === "number" && Number.isFinite(apiDistanceM)) return apiDistanceM;
  if (place.lat === null || place.lon === null) return null;
  return haversineM(destination.lat, destination.lon, place.lat, place.lon);
}

/** True when a result is too far from the destination to show (more than 1.5x
 *  its radius). A result without any distance or coordinates is kept. */
export function isTooFar(destination: Pick<Destination, "radiusM">, distanceM: number | null): boolean {
  return distanceM !== null && distanceM > destination.radiusM * MAX_DISTANCE_FACTOR;
}

/** The most common "city, country" among places, for "results are in X". */
export function majorityLocalityLabel(results: readonly PlaceResult[]): string | undefined {
  const counts = new Map<string, number>();
  for (const r of results) {
    const label = [r.place.city, countryNameOfPlace(r)].filter(Boolean).join(", ");
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * Are the results where the trip is? The API reports `query.localities` only
 * for text locations; with a POINT it does not, so the answer comes from the
 * results themselves: their country (when the destination has one) and their
 * distance from the point (computed from coordinates when the API gives none;
 * a result with neither does not count as near). `dropped` is how many results
 * findPlaces already removed for being too far.
 */
export function checkLocality(
  destination: Destination,
  results: readonly PlaceResult[],
  localityLabel?: string,
  dropped = 0,
): LocalityCheck {
  const requested = destination.disambiguation ?? destination.name;
  if (results.length === 0) return { requested, resolved: localityLabel ?? "no results", ok: true, dropped };

  const resolved = localityLabel ?? majorityLocalityLabel(results) ?? "unknown";
  const code = destination.countryCode?.toUpperCase();
  const countryOk = !code || results.filter((r) => countryCodeOfPlace(r) === code).length * 2 >= results.length;
  const limit = destination.radiusM * NEAR_FACTOR;
  const near = results.filter((r) => {
    const distance = distanceFromDestination(destination, r.place, r.distanceM);
    return distance !== null && distance <= limit;
  }).length;
  const radiusOk = near >= results.length * 0.8;
  return { requested, resolved, ok: countryOk && radiusOk, dropped };
}
