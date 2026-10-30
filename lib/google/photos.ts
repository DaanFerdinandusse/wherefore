import "server-only";

// Google photos through our own route: the browser never sees the server key,
// and the proxy answers with a public cache header so a gallery is fetched
// once an hour, not on every profile open. Photo names are never stored. The
// bytes are streamed through, never buffered, and capped in width and size.

import { PLACES_API_BASE, googleServerKey } from "./config";
import { GoogleApiError, GoogleInputError, GooglePhotoTooLargeError } from "./errors";

export const PHOTO_PROXY_PATH = "/api/places/photo";
export const DEFAULT_PHOTO_WIDTH = 800;
/** Widest photo the proxy asks for: fills the viewer on a 2x screen and stays
 *  well under MAX_PHOTO_BYTES, which Google's 4800 px originals can pass. */
export const MAX_PHOTO_WIDTH = 2400;
/** Largest upstream body the proxy passes on. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
/** Short side of a tile photo: covers the profile's 580 x 520 arch on a 2x screen. */
export const TILE_SHORT_SIDE_PX = 1000;
/** Long side of a photo in the viewer. */
export const FULL_LONG_SIDE_PX = 2400;

// places/{placeId}/photos/{photoReference}: ids are URL-safe base64-ish.
const PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]{10,}\/photos\/[A-Za-z0-9_-]{10,}$/;

export function isPhotoName(name: string): boolean {
  return PHOTO_NAME_RE.test(name);
}

/** The Google place a photo belongs to, from its name. */
export function photoPlaceId(name: string): string | null {
  return isPhotoName(name) ? (name.split("/")[1] ?? null) : null;
}

export function clampPhotoWidth(width: number | undefined): number {
  if (width === undefined || !Number.isFinite(width)) return DEFAULT_PHOTO_WIDTH;
  return Math.min(MAX_PHOTO_WIDTH, Math.max(1, Math.round(width)));
}

type PhotoSize = { widthPx?: number; heightPx?: number };

/** Width that gives a tile photo its short side. Sized by width alone, a
 *  landscape photo comes back too low and is stretched to fill a tall frame. */
export function tilePhotoWidth({ widthPx, heightPx }: PhotoSize): number {
  if (!widthPx || !heightPx) return DEFAULT_PHOTO_WIDTH;
  return clampPhotoWidth(Math.min(widthPx, TILE_SHORT_SIDE_PX * Math.max(1, widthPx / heightPx)));
}

/** Width that gives a viewer photo its long side, never above the original. */
export function fullPhotoWidth({ widthPx, heightPx }: PhotoSize): number {
  if (!widthPx || !heightPx) return MAX_PHOTO_WIDTH;
  return clampPhotoWidth(Math.min(widthPx, FULL_LONG_SIDE_PX * Math.min(1, widthPx / heightPx)));
}

/** Same-origin URL for a Google photo at a width, for an <img src>. */
export function photoProxyUrl(name: string, maxWidthPx: number = DEFAULT_PHOTO_WIDTH): string {
  const params = new URLSearchParams({ name, w: String(clampPhotoWidth(maxWidthPx)) });
  return `${PHOTO_PROXY_PATH}?${params.toString()}`;
}

export type PhotoStream = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  /** The upstream Content-Length when it sent one (already checked against the
   *  cap). Not forwarded: with a content encoding it is the encoded size. */
  contentLength?: number;
};

/**
 * Opens the photo at `/v1/{name}/media` (Google answers with a redirect to the
 * image, which fetch follows) and hands back its body as a stream. A declared
 * size over 4 MB is refused before any byte is read; an undeclared one is
 * counted while it streams and the stream errors past 4 MB.
 * @throws GoogleInputError for a malformed name, GoogleNotConfiguredError
 *   without a key, GoogleApiError for a non 2xx or non image answer,
 *   GooglePhotoTooLargeError for a declared size over the cap.
 */
export async function fetchPhoto(
  name: string,
  maxWidthPx: number | undefined,
  deps: { fetch?: typeof fetch } = {},
): Promise<PhotoStream> {
  if (!isPhotoName(name)) throw new GoogleInputError("Not a Google photo name");
  const key = googleServerKey();
  const url = `${PLACES_API_BASE}/${name}/media?maxWidthPx=${clampPhotoWidth(maxWidthPx)}`;
  const response = await (deps.fetch ?? fetch)(url, {
    headers: { "X-Goog-Api-Key": key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new GoogleApiError(response.status, await response.text().catch(() => ""));
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) {
    await response.body?.cancel().catch(() => {});
    throw new GoogleApiError(502, `Expected an image, got ${contentType}`);
  }
  if (!response.body) throw new GoogleApiError(502, "The photo answer had no body");

  const declared = Number(response.headers.get("content-length") ?? NaN);
  const contentLength = Number.isFinite(declared) && declared >= 0 ? declared : undefined;
  if (contentLength !== undefined && contentLength > MAX_PHOTO_BYTES) {
    await response.body.cancel().catch(() => {});
    throw new GooglePhotoTooLargeError(contentLength, MAX_PHOTO_BYTES);
  }
  return {
    body: response.body.pipeThrough(limitBytes(MAX_PHOTO_BYTES)),
    contentType,
    ...(contentLength !== undefined ? { contentLength } : {}),
  };
}

/** Passes chunks through until `max` bytes, then errors the stream (which
 *  cancels the upstream read). */
export function limitBytes(max: number): TransformStream<Uint8Array, Uint8Array> {
  let seen = 0;
  return new TransformStream({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > max) {
        controller.error(new GooglePhotoTooLargeError(seen, max));
        return;
      }
      controller.enqueue(chunk);
    },
  });
}
