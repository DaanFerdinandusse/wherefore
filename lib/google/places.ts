import "server-only";

// Place details from Places API (New), on demand for the place profile. Two
// field masks so the cheap tier pays for the common case: `basic` when a
// profile opens (name, type, status, location, photos), `full` only when the
// ratings and reviews section scrolls into view. Answers are cached in memory
// for 10 minutes and never persisted (Google's terms: only the id is stored).

import { PLACES_API_BASE, googleServerKey } from "./config";
import type { DetailsTier, GoogleAttribution, GooglePlaceDetails, PlaceDetails } from "./contracts";
import { GoogleApiError, GoogleInputError, GoogleSchemaError } from "./errors";
import { fullPhotoWidth, photoProxyUrl, tilePhotoWidth } from "./photos";
import { type RawPlaceDetails, placeDetailsSchema } from "./types";

export const BASIC_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "googleMapsUri",
  "googleMapsLinks",
  "primaryType",
  "primaryTypeDisplayName",
  "businessStatus",
  "photos",
  "location",
  // The place's offset from UTC, so the profile can read today's closing
  // time in the place's own day instead of guessing it.
  "utcOffsetMinutes",
] as const;

// Field mask tiers (Place Details, Places API New): BASIC_FIELDS stay within
// Essentials and Pro; rating, userRatingCount, both opening hours fields,
// websiteUri, nationalPhoneNumber and priceLevel are Enterprise; reviews and
// editorialSummary are Enterprise + Atmosphere. Only the full tier pays for
// those.
export const FULL_FIELDS = [
  ...BASIC_FIELDS,
  "rating",
  "userRatingCount",
  // currentOpeningHours knows today's exceptions (holidays), so it decides
  // "open now"; regularOpeningHours gives the usual weekly table.
  "currentOpeningHours",
  "regularOpeningHours",
  "websiteUri",
  "nationalPhoneNumber",
  "priceLevel",
  "reviews",
  "editorialSummary",
  // Enterprise: whether the place takes reservations, and its price per person.
  "reservable",
  "priceRange",
] as const;

export function fieldMask(tier: DetailsTier): string {
  return (tier === "full" ? FULL_FIELDS : BASIC_FIELDS).join(",");
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export function isPlaceId(placeId: string): boolean {
  return PLACE_ID_RE.test(placeId);
}

export function createPlaceDetails(deps: { fetch?: typeof fetch; now?: () => number } = {}): PlaceDetails & {
  clearCache(): void;
} {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { value: GooglePlaceDetails; expiresAt: number }>();
  // Concurrent misses for the same place and tier share one request (within
  // this instance).
  const inflight = new Map<string, Promise<GooglePlaceDetails>>();

  function fresh(key: string): GooglePlaceDetails | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  const placeDetails = async (placeId: string, tier: DetailsTier): Promise<GooglePlaceDetails> => {
    if (!isPlaceId(placeId)) throw new GoogleInputError("Not a Google place id");
    // A full answer also covers a basic request.
    const hit = fresh(`${placeId}:${tier}`) ?? (tier === "basic" ? fresh(`${placeId}:full`) : undefined);
    if (hit) return hit;
    const cacheKey = `${placeId}:${tier}`;
    const pending = inflight.get(cacheKey) ?? (tier === "basic" ? inflight.get(`${placeId}:full`) : undefined);
    if (pending) return pending;

    const request = load(placeId, tier).finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, request);
    return request;
  };

  async function load(placeId: string, tier: DetailsTier): Promise<GooglePlaceDetails> {
    const key = googleServerKey();
    const response = await doFetch(`${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}?languageCode=en`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMask(tier) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new GoogleApiError(response.status, await response.text().catch(() => ""));
    const parsed = placeDetailsSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new GoogleSchemaError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const value = normalizeDetails(parsed.data, tier);
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(`${placeId}:${tier}`, { value, expiresAt: now() + CACHE_TTL_MS });
    return value;
  }

  return Object.assign(placeDetails, { clearCache: () => cache.clear() });
}

/** Default instance: env key, fetch, one cache per server instance. */
export const placeDetails: PlaceDetails = createPlaceDetails();

function attribution(raw: { displayName?: string; uri?: string; photoUri?: string } | undefined): GoogleAttribution {
  return {
    ...(raw?.displayName ? { displayName: raw.displayName } : {}),
    ...(raw?.uri ? { uri: raw.uri } : {}),
    ...(raw?.photoUri ? { photoUri: raw.photoUri } : {}),
  };
}

type RawMoney = { currencyCode?: string; units?: string | number; nanos?: number };

function amountOf(money: RawMoney | undefined): number | undefined {
  if (!money || money.units === undefined) return undefined;
  const units = Number(money.units);
  return Number.isFinite(units) ? units : undefined;
}

/** Google's priceRange as whole units of one currency; undefined without a currency or amount. */
export function priceRangeOf(raw: { startPrice?: RawMoney; endPrice?: RawMoney } | undefined): GooglePlaceDetails["priceRange"] {
  const currency = raw?.startPrice?.currencyCode ?? raw?.endPrice?.currencyCode;
  const start = amountOf(raw?.startPrice);
  const end = amountOf(raw?.endPrice);
  if (!currency || (start === undefined && end === undefined)) return undefined;
  return { currency, ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}) };
}

export function normalizeDetails(raw: RawPlaceDetails, tier: DetailsTier): GooglePlaceDetails {
  const details: GooglePlaceDetails = {
    tier,
    placeId: raw.id,
    name: raw.displayName?.text,
    address: raw.formattedAddress,
    mapsUrl: raw.googleMapsUri,
    photosUrl: raw.googleMapsLinks?.photosUri,
    primaryType: raw.primaryType,
    primaryTypeLabel: raw.primaryTypeDisplayName?.text,
    businessStatus: raw.businessStatus,
    location: raw.location ? { lat: raw.location.latitude, lon: raw.location.longitude } : undefined,
    utcOffsetMinutes: raw.utcOffsetMinutes,
    photos: (raw.photos ?? []).map((photo) => ({
      name: photo.name,
      url: photoProxyUrl(photo.name, tilePhotoWidth(photo)),
      fullUrl: photoProxyUrl(photo.name, fullPhotoWidth(photo)),
      widthPx: photo.widthPx,
      heightPx: photo.heightPx,
      attributions: (photo.authorAttributions ?? []).map(attribution),
    })),
  };
  if (tier === "full") {
    Object.assign(details, {
      rating: raw.rating,
      ratingCount: raw.userRatingCount,
      openNow: raw.currentOpeningHours?.openNow ?? raw.regularOpeningHours?.openNow,
      openingHours: raw.regularOpeningHours?.weekdayDescriptions ?? raw.currentOpeningHours?.weekdayDescriptions,
      website: raw.websiteUri,
      phone: raw.nationalPhoneNumber,
      priceLevel: raw.priceLevel ? PRICE_LEVELS[raw.priceLevel] : undefined,
      editorialSummary: raw.editorialSummary?.text,
      reservable: raw.reservable,
      priceRange: priceRangeOf(raw.priceRange),
      reviews: (raw.reviews ?? []).map((review) => ({
        rating: review.rating,
        text: review.text?.text ?? review.originalText?.text,
        relativeTime: review.relativePublishTimeDescription,
        publishTime: review.publishTime,
        author: attribution(review.authorAttribution),
        googleMapsUri: review.googleMapsUri,
      })),
    } satisfies Partial<GooglePlaceDetails>);
  }
  return JSON.parse(JSON.stringify(details)) as GooglePlaceDetails;
}
