// The browser side of /api/trips/[tripId]/share. Pure apart from fetch, so the
// error reading is testable.

export function shareRequest(tripId: string, method: "POST" | "DELETE"): Promise<Response> {
  return fetch(`/api/trips/${encodeURIComponent(tripId)}/share`, { method });
}

/** The `{ error: { message } }` the route answers, or the fallback. */
export async function readShareError(response: Response, fallback: string): Promise<string> {
  if (response.status === 401) return "Your session ended. Sign in again to share.";
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body && "error" in body) {
      const error = body.error;
      if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
        return error.message;
      }
    }
  } catch {
    // Not JSON: fall through to the fallback.
  }
  return fallback;
}
