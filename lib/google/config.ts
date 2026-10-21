import "server-only";

import { GoogleNotConfiguredError } from "./errors";

export const PLACES_API_BASE = "https://places.googleapis.com/v1";

/** The server key (API-restricted to Places). Read per call so a key added to
 *  the env later is picked up without a code change.
 *  @throws GoogleNotConfiguredError when it is missing. */
export function googleServerKey(): string {
  const key = process.env.GOOGLE_PLACES_SERVER_KEY;
  if (!key) throw new GoogleNotConfiguredError();
  return key;
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_SERVER_KEY);
}
