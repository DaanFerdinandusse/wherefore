import type { GoogleAttribution, GooglePhoto } from "@/lib/google/contracts";

// Which photos a place shows. Google's come first and alone: they are far
// larger than the provider's 420 px images and lead with the photo Maps leads
// with. Provider images stand in while Google loads or when it has no photos.

export type PlacePhoto = {
  src: string;
  /** Larger version for the full-screen viewer, when there is one. */
  fullSrc?: string;
  alt: string;
  /** Set for Google photos: shown with the photo. */
  attributions?: GoogleAttribution[];
};

export function placePhotos(
  name: string,
  provider: { url: string }[] | undefined,
  fallbackUrl: string | undefined,
  google: GooglePhoto[] | undefined,
  /** "card" is the chat card's smaller tiles, a third of the bytes of the profile's arch. */
  size: "card" | "profile" = "profile",
): PlacePhoto[] {
  if (google?.length) {
    return google.map((photo, i) => ({
      src: size === "card" ? photo.cardUrl : photo.url,
      fullSrc: photo.fullUrl,
      alt: `${name}, photo ${i + 1}`,
      attributions: photo.attributions,
    }));
  }
  const images = provider?.length ? provider : fallbackUrl ? [{ url: fallbackUrl }] : [];
  return images.map((image, i) => ({ src: image.url, alt: `${name}, photo ${i + 1}` }));
}
