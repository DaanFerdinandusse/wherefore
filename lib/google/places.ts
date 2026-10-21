import "server-only";

// Place details from Places API (New), on demand for the place profile. Two
// field masks so the cheap tier pays for the common case: `basic` when a
// profile opens (name, type, status, location, photos), `full` only when the
// ratings and reviews section scrolls into view. Answers are cached in memory
// for 10 minutes and never persisted (Google's terms: only the id is stored).

import { PLACES_API_BASE, googleServerKey } from "./config";
import type { DetailsTier, GoogleAttribution, GooglePlaceDetails, PlaceDetails } from "./contracts";
import { GoogleApiError, GoogleInputError, GoogleSchemaError } from "./errors";
import { photoProxyUrl } from "./photos";
import { type RawPlaceDetails, placeDetailsSchema } from "./types";

export const BASIC_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "googleMapsUri",
  "primaryType",
  "primaryTypeDisplayName",
  "businessStatus",
  "photos",
  "location",
] as const;

export const FULL_FIELDS = [
  ...BASIC_FIELDS,
  "rating",
  "userRatingCount",
  "regularOpeningHours",
  "websiteUri",
  "nationalPhoneNumber",
  "priceLevel",
  "reviews",
  "editorialSummary",
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
  };

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

export function normalizeDetails(raw: RawPlaceDetails, tier: DetailsTier): GooglePlaceDetails {
  const details: GooglePlaceDetails = {
    tier,
    placeId: raw.id,
    name: raw.displayName?.text,
    address: raw.formattedAddress,
    mapsUrl: raw.googleMapsUri,
    primaryType: raw.primaryType,
    primaryTypeLabel: raw.primaryTypeDisplayName?.text,
    businessStatus: raw.businessStatus,
    location: raw.location ? { lat: raw.location.latitude, lon: raw.location.longitude } : undefined,
    photos: (raw.photos ?? []).map((photo) => ({
      name: photo.name,
      url: photoProxyUrl(photo.name),
      widthPx: photo.widthPx,
      heightPx: photo.heightPx,
      attributions: (photo.authorAttributions ?? []).map(attribution),
    })),
  };
  if (tier === "full") {
    Object.assign(details, {
      rating: raw.rating,
      ratingCount: raw.userRatingCount,
      openNow: raw.regularOpeningHours?.openNow,
      openingHours: raw.regularOpeningHours?.weekdayDescriptions,
      website: raw.websiteUri,
      phone: raw.nationalPhoneNumber,
      priceLevel: raw.priceLevel ? PRICE_LEVELS[raw.priceLevel] : undefined,
      editorialSummary: raw.editorialSummary?.text,
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
