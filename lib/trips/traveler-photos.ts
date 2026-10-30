import "server-only";

import { PHOTO_PROXY_PATH, isGoogleConfigured, placeDetails } from "@/lib/google";
import type { GooglePhoto, PlaceDetails } from "@/lib/google/contracts";

import { MAX_PLACE_IMAGES, type SharedSlotRow } from "./share";

// Google's photos for the traveler view, read fresh on every view and never
// stored (Google's terms). The provider's images are too small for this page.
// A slow or failed lookup leaves that one place on the provider's images, so
// Google can never take the page down or hold it for long.

const LOOKUP_TIMEOUT_MS = 3_000;

/** The public route that serves a shared trip's photos: a traveler has no session for the proxy. */
export function sharePhotoPath(token: string): string {
  return `/api/share/${token}/photo`;
}

async function photosOf(placeId: string, details: PlaceDetails): Promise<GooglePhoto[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
  });
  try {
    const found = await Promise.race([details(placeId, "basic"), timeout]);
    return found?.photos ?? [];
  } catch (error) {
    console.warn("[traveler-photos]", error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** The rows with each place's Google photos, served from `photoPath`. */
export async function withGooglePhotos(
  slots: readonly SharedSlotRow[],
  photoPath: string = PHOTO_PROXY_PATH,
  details: PlaceDetails = placeDetails,
): Promise<SharedSlotRow[]> {
  if (!isGoogleConfigured()) return [...slots];
  const ids = [...new Set(slots.flatMap((slot) => slot.place?.googlePlaceId ?? []))];
  const found = new Map(await Promise.all(ids.map(async (id) => [id, await photosOf(id, details)] as const)));
  // Both proxy routes take the same query, so only the path changes.
  const served = (url: string) => `${photoPath}${url.slice(PHOTO_PROXY_PATH.length)}`;

  return slots.map((slot) => {
    const photos = slot.place?.googlePlaceId ? found.get(slot.place.googlePlaceId) : undefined;
    if (!slot.place || !photos?.length) return slot;
    const googlePhotos = photos.slice(0, MAX_PLACE_IMAGES).map((photo) => {
      const author = photo.attributions.find((attribution) => attribution.displayName);
      return {
        src: served(photo.url),
        fullSrc: served(photo.fullUrl),
        ...(author?.displayName ? { author: author.displayName } : {}),
        ...(author?.uri ? { authorUri: author.uri } : {}),
      };
    });
    return { ...slot, place: { ...slot.place, googlePhotos } };
  });
}
