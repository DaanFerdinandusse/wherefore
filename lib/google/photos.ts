import "server-only";

// Google photos through our own route: the browser never sees the server key,
// and the proxy answers with a public cache header so a gallery is fetched
// once an hour, not on every profile open. Photo names are never stored.

import { PLACES_API_BASE, googleServerKey } from "./config";
import { GoogleApiError, GoogleInputError } from "./errors";

export const PHOTO_PROXY_PATH = "/api/places/photo";
export const DEFAULT_PHOTO_WIDTH = 800;
const MAX_PHOTO_WIDTH = 4800;

// places/{placeId}/photos/{photoReference}: ids are URL-safe base64-ish.
const PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]{10,}\/photos\/[A-Za-z0-9_-]{10,}$/;

export function isPhotoName(name: string): boolean {
  return PHOTO_NAME_RE.test(name);
}

export function clampPhotoWidth(width: number | undefined): number {
  if (width === undefined || !Number.isFinite(width)) return DEFAULT_PHOTO_WIDTH;
  return Math.min(MAX_PHOTO_WIDTH, Math.max(1, Math.round(width)));
}

/** Same-origin URL for a Google photo at a width, for an <img src>. */
export function photoProxyUrl(name: string, maxWidthPx: number = DEFAULT_PHOTO_WIDTH): string {
  const params = new URLSearchParams({ name, w: String(clampPhotoWidth(maxWidthPx)) });
  return `${PHOTO_PROXY_PATH}?${params.toString()}`;
}

/**
 * Fetches the photo bytes from `/v1/{name}/media` (Google answers with a
 * redirect to the image, which fetch follows).
 * @throws GoogleInputError for a malformed name, GoogleNotConfiguredError
 *   without a key, GoogleApiError for a non 2xx answer.
 */
export async function fetchPhoto(
  name: string,
  maxWidthPx: number | undefined,
  deps: { fetch?: typeof fetch } = {},
): Promise<{ body: ArrayBuffer; contentType: string }> {
  if (!isPhotoName(name)) throw new GoogleInputError("Not a Google photo name");
  const key = googleServerKey();
  const url = `${PLACES_API_BASE}/${name}/media?maxWidthPx=${clampPhotoWidth(maxWidthPx)}`;
  const response = await (deps.fetch ?? fetch)(url, {
    headers: { "X-Goog-Api-Key": key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new GoogleApiError(response.status, await response.text().catch(() => ""));
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) throw new GoogleApiError(502, `Expected an image, got ${contentType}`);
  return { body: await response.arrayBuffer(), contentType };
}
