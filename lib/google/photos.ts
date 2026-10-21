import "server-only";

// Google photos through our own route: the browser never sees the server key,
// and the proxy answers with a public cache header so a gallery is fetched
// once an hour, not on every profile open. Photo names are never stored. The
// bytes are streamed through, never buffered, and capped in width and size.

import { PLACES_API_BASE, googleServerKey } from "./config";
import { GoogleApiError, GoogleInputError, GooglePhotoTooLargeError } from "./errors";

export const PHOTO_PROXY_PATH = "/api/places/photo";
export const DEFAULT_PHOTO_WIDTH = 800;
/** Widest photo the proxy asks for: enough for a full-width profile header. */
export const MAX_PHOTO_WIDTH = 1600;
/** Largest upstream body the proxy passes on. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

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
