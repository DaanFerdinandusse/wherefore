// Where to land after sign-in. Pure, used on both sides of the boundary.

export const HOME_PATH = "/trips";

// A fixed origin to parse against: the value only has to stay on it.
const BASE = "https://wherefore.invalid";
const BASE_ORIGIN = new URL(BASE).origin;

// Control characters (tab and newline among them, which URL parsers strip)
// and backslashes (which browsers read as slashes) are never part of a path
// we hand out.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;

const BLOCKED_PREFIXES = ["/sign-in", "/sign-up", "/api"];

/**
 * A same-origin app path from `?next=`, normalized, else the Trips home.
 * Blocks open redirects: the value must start with a single slash, contain
 * no control characters or backslashes, and still be a local path after the
 * URL parser has normalized it (so "/a/../..//evil.example" is refused too).
 */
export function safeNextPath(next: string | null | undefined, fallback = HOME_PATH): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return fallback;
  if (UNSAFE_CHARS.test(next)) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE_ORIGIN) return fallback;
  // Normalization can collapse a path into a protocol-relative one.
  if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return fallback;
  if (BLOCKED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
