import "server-only";

// HTTP mapping for the place routes: one place that decides which Google
// failure becomes which status and sentence.

import { GoogleApiError, GoogleInputError, GoogleNotConfiguredError, GoogleSchemaError } from "./errors";

export type GoogleErrorCode =
  | "google_not_configured"
  | "google_bad_input"
  | "google_not_found"
  | "google_rate_limited"
  | "google_unavailable";

const COPY: Record<GoogleErrorCode, string> = {
  google_not_configured: "Google photos and details are not set up on this server yet. Add the Places server key to show them.",
  google_bad_input: "That is not a valid Google place or photo reference.",
  google_not_found: "Google has no place with this id. It may have closed or moved.",
  google_rate_limited: "Too many Google requests just now. Try again in a minute.",
  google_unavailable: "Google did not answer. Try again in a minute.",
};

function body(code: GoogleErrorCode, status: number): Response {
  return Response.json({ error: COPY[code], code }, { status, headers: { "Cache-Control": "no-store" } });
}

/** A Response for a Google failure; rethrows anything that is not one. */
export function googleErrorResponse(error: unknown): Response {
  if (error instanceof GoogleNotConfiguredError) return body("google_not_configured", 503);
  if (error instanceof GoogleInputError) return body("google_bad_input", 400);
  if (error instanceof GoogleApiError) {
    if (error.status === 404) return body("google_not_found", 404);
    if (error.status === 429) return body("google_rate_limited", 429);
    if (error.status === 400) return body("google_bad_input", 400);
    console.error("[google]", error.message);
    return body("google_unavailable", 502);
  }
  if (error instanceof GoogleSchemaError) {
    console.error("[google]", error.message);
    return body("google_unavailable", 502);
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return body("google_unavailable", 504);
  }
  throw error;
}
