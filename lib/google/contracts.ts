// Types the place profile reads from Google. Nothing here is persisted: Google's
// terms allow storing only the place id, so photo names, ratings and reviews
// live in memory (10 minutes) and in the browser, never in the database.

export type DetailsTier = "basic" | "full";

export type GoogleAttribution = { displayName?: string; uri?: string; photoUri?: string };

export type GooglePhoto = {
  /** places/{placeId}/photos/{photoId}; pass it to photoProxyUrl, never store it. */
  name: string;
  /** Same-origin proxy URL sized for tiles and thumbnails, ready for an <img>. */
  url: string;
  /** Same-origin proxy URL sized for the full-screen viewer. */
  fullUrl: string;
  widthPx?: number;
  heightPx?: number;
  /** Must be shown with the photo. */
  attributions: GoogleAttribution[];
};

export type GoogleReview = {
  rating?: number;
  text?: string;
  relativeTime?: string;
  publishTime?: string;
  author: GoogleAttribution;
  googleMapsUri?: string;
};

export type GooglePlaceDetails = {
  tier: DetailsTier;
  placeId: string;
  name?: string;
  address?: string;
  mapsUrl?: string;
  /** The place's whole gallery on Google Maps: the API returns 10 photos at most. */
  photosUrl?: string;
  primaryType?: string;
  primaryTypeLabel?: string;
  businessStatus?: string;
  location?: { lat: number; lon: number };
  /** The place's offset from UTC in minutes, for its local time. */
  utcOffsetMinutes?: number;
  photos: GooglePhoto[];
  // full tier only
  rating?: number;
  ratingCount?: number;
  openNow?: boolean;
  openingHours?: string[];
  website?: string;
  phone?: string;
  /** 0 (free) to 4 (very expensive), mapped from Google's enum. */
  priceLevel?: number;
  reviews?: GoogleReview[];
  editorialSummary?: string;
  /** Google's "reservable": true takes reservations, false does not, missing is unknown. */
  reservable?: boolean;
  /** Google's price range per person, in whole currency units. */
  priceRange?: { currency: string; start?: number; end?: number };
};

export type PlaceDetails = (placeId: string, tier: DetailsTier) => Promise<GooglePlaceDetails>;
