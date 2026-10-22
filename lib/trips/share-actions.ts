import "server-only";

import type { ScopeInput } from "@/lib/auth/scope";
import { optionalEnv } from "@/lib/env";

import { revokeShare, setShareToken } from "./mutations";

// Share link actions for the workspace. Creating a link is idempotent: an
// existing token is kept (setShareToken coalesces), so pressing Share twice
// copies the same link. Having a token is what moves the trip to the
// "shared" stage (computeStage), so neither action touches the stage.

/** The public URL of a share token, from APP_URL, else the request's own origin. */
export function shareUrl(token: string, origin?: string): string {
  const base = (optionalEnv("APP_URL") ?? origin ?? "").replace(/\/+$/, "");
  return `${base}/s/${encodeURIComponent(token)}`;
}

/** Creates (or keeps) the trip's share token and returns its link. Throws NotFoundError out of scope. */
export async function createShareLink(
  tripId: string,
  scope: ScopeInput,
  origin?: string,
): Promise<{ url: string; token: string }> {
  const trip = await setShareToken(tripId, scope);
  if (!trip.shareToken) throw new Error("The share token was not stored.");
  return { url: shareUrl(trip.shareToken, origin), token: trip.shareToken };
}

/** Revokes the link: the old URL shows the not-found page from now on. */
export async function stopSharing(tripId: string, scope: ScopeInput): Promise<void> {
  await revokeShare(tripId, scope);
}
