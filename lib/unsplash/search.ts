import "server-only";

import { optionalEnv } from "@/lib/env";

import { firstCoverPhoto, UNSPLASH_API_URL, type CoverPhoto } from "./map";

// The Unsplash REST calls. A cover is a nice-to-have on a trip: without a key,
// over the rate limit or on a slow answer these log and give up, and the trip
// keeps its place photo.

const TIMEOUT_MS = 2_500;

const headers = (key: string) => ({ Authorization: `Client-ID ${key}`, "Accept-Version": "v1" });

/** The first landscape photo for a destination, or null when there is none to use. */
export async function findCoverPhoto(destination: string): Promise<CoverPhoto | null> {
  const key = optionalEnv("UNSPLASH_ACCESS_KEY");
  if (!key) return null;

  const url = new URL(`${UNSPLASH_API_URL}/search/photos`);
  url.searchParams.set("query", destination);
  url.searchParams.set("per_page", "5");
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("content_filter", "high");

  try {
    const response = await fetch(url, { headers: headers(key), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      console.warn(`Cover search for "${destination}" returned ${response.status}`);
      return null;
    }
    return firstCoverPhoto(await response.json());
  } catch (error) {
    console.warn(`Cover search for "${destination}" failed`, error);
    return null;
  }
}

/** Tells Unsplash the photo is in use, which its terms require. Never throws. */
export async function markCoverPhotoUsed(downloadLocation: string): Promise<void> {
  const key = optionalEnv("UNSPLASH_ACCESS_KEY");
  if (!key) return;
  try {
    const response = await fetch(downloadLocation, { headers: headers(key), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) console.warn(`Cover download ping returned ${response.status}`);
  } catch (error) {
    console.warn("Cover download ping failed", error);
  }
}
