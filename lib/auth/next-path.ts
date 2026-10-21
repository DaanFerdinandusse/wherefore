// Where to land after sign-in. Pure, used on both sides of the boundary.

export const HOME_PATH = "/trips";

/** A same-origin app path from `?next=`, else the Trips home. Blocks open redirects. */
export function safeNextPath(next: string | null | undefined, fallback = HOME_PATH): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  if (next.startsWith("/sign-in") || next.startsWith("/sign-up") || next.startsWith("/api/")) {
    return fallback;
  }
  return next;
}
