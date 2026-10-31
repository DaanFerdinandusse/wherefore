// How a place photo is loaded, decided from its URL alone, so FilmImage treats
// the same source the same way everywhere.
//
// - provider: recommendation images (any host under qloo.com). The origin is
//   slow and sometimes fails outright, and the dev image optimizer gives up
//   after 7 s with a 504, which left cards as empty frames. They are stored
//   small (420 px wide), so the browser loads them directly: unoptimized, with
//   an explicit size, lazy and async, over a warm placeholder background.
// - proxy: our Google photo routes (/api/places/photo, and
//   /api/share/<token>/photo for shared trips). The first requires the
//   viewer's session and the optimizer fetches local URLs without cookies, so
//   it cannot go through the optimizer either; they size the photo themselves
//   (?w=) and send Cache-Control. Loaded directly, lazy and async.
// - unsplash: trip covers. Unsplash requires hotlinking and its CDN resizes on
//   request, so unsplashLoader asks it for each width instead of the optimizer.
// - other: static imports, files in /public and public remote hosts
//   (Google avatars). These stay on the optimizer.

import type { ImageLoaderProps, ImageProps } from "next/image";

export type ImageSource = "provider" | "proxy" | "unsplash" | "other";

export type ImagePolicy = {
  source: ImageSource;
  unoptimized: boolean;
  /** Intrinsic size to give the img when the caller does not set one. */
  width?: number;
  height?: number;
  loading?: "lazy";
  decoding?: "async";
  /** Show the warm placeholder background while the bytes arrive. */
  placeholder: boolean;
};

/** Mirrors PHOTO_PROXY_PATH in lib/google/photos.ts (server only). */
export const PHOTO_PROXY_PATH = "/api/places/photo";
const SHARE_PHOTO_RE = /^\/api\/share\/[^/?]+\/photo(\?|$)/;

// Provider images come as 420 px wide portraits ("...-420x-outside.jpg").
const PROVIDER_WIDTH = 420;
const PROVIDER_HEIGHT = 525;

const OPTIMIZED: ImagePolicy = { source: "other", unoptimized: false, placeholder: false };

type Src = ImageProps["src"] | null | undefined;

// Static imports are bundled files: always optimized.
function srcString(src: Src): string | undefined {
  return typeof src === "string" && src ? src : undefined;
}

export function isProviderHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "qloo.com" || host.endsWith(".qloo.com");
}

/** The width the provider encodes in the file name ("-420x-"), if any. */
function providerWidth(pathname: string): number | undefined {
  const match = /-(\d{2,4})x-/.exec(pathname);
  return match ? Number(match[1]) : undefined;
}

/**
 * A provider image at another width: its server resizes from the name. It
 * also enlarges past the original, so a wider file is sharper only when the
 * original had the pixels. Any other url comes back as it is.
 */
export function providerImageAt(url: string, width: number): string {
  try {
    if (!isProviderHost(new URL(url).hostname)) return url;
  } catch {
    return url;
  }
  return url.replace(/-\d{2,4}x-(?=[a-z]+\.[a-z]+$)/i, `-${width}x-`);
}

/**
 * The provider keeps two photos of a place, and its first request for each
 * decides how long a tile stays empty. Timed on real places: "-outside" took 10
 * to 26 s for 5 of 14 uncached files, "-auto" for 1 of 22, and a smaller size
 * did not help. "-auto" is a different photo of the same place, named from
 * the same id, so a tile asks for it first. Any other url comes back as it is.
 */
export function fastProviderImage(url: string): string {
  try {
    if (!isProviderHost(new URL(url).hostname)) return url;
  } catch {
    return url;
  }
  return url.replace(/-[A-Za-z0-9]{6}-(\d{2,4}x)-outside(\.[a-z]+)$/i, "-$1-auto$2");
}

/** The photo to try next: the fast copy, then the url given, then none. */
export function nextImage<Src>(src: Src, failed: readonly Src[]): Src | undefined {
  const fast = typeof src === "string" ? (fastProviderImage(src) as Src) : src;
  return [fast, src].find((candidate) => !failed.includes(candidate));
}

const UNSPLASH_HOST = "images.unsplash.com";

/** The photo at the width the page asks for. `fm` would override `auto=format`. */
export function unsplashLoader({ src, width, quality }: ImageLoaderProps): string {
  const url = new URL(src);
  url.searchParams.delete("fm");
  url.searchParams.set("auto", "format");
  url.searchParams.set("fit", "max");
  url.searchParams.set("w", String(width));
  url.searchParams.set("q", String(quality ?? 75));
  return url.toString();
}

export function imagePolicy(src: Src): ImagePolicy {
  const url = srcString(src);
  if (!url) return OPTIMIZED;

  if (url.startsWith("/")) {
    if (
      url === PHOTO_PROXY_PATH ||
      url.startsWith(`${PHOTO_PROXY_PATH}?`) ||
      url.startsWith(`${PHOTO_PROXY_PATH}/`) ||
      SHARE_PHOTO_RE.test(url)
    ) {
      return { source: "proxy", unoptimized: true, loading: "lazy", decoding: "async", placeholder: true };
    }
    return OPTIMIZED;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return OPTIMIZED;
  }
  if (parsed.protocol === "data:" || parsed.protocol === "blob:") {
    return { source: "other", unoptimized: true, decoding: "async", placeholder: false };
  }
  if (parsed.hostname === UNSPLASH_HOST) {
    return { source: "unsplash", unoptimized: false, placeholder: false };
  }
  if (isProviderHost(parsed.hostname)) {
    const width = providerWidth(parsed.pathname) ?? PROVIDER_WIDTH;
    return {
      source: "provider",
      unoptimized: true,
      width,
      height: Math.round((width * PROVIDER_HEIGHT) / PROVIDER_WIDTH),
      loading: "lazy",
      decoding: "async",
      placeholder: true,
    };
  }
  return OPTIMIZED;
}
