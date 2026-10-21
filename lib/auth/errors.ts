// PLACEHOLDER written by the chat runtime branch, mirroring the auth branch's
// lib/auth/errors.ts (UnauthorizedError, errorResponse). The real file
// replaces this on merge.

export class UnauthorizedError extends Error {
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** 401 for UnauthorizedError, 404 for NotFoundError; rethrows anything else. */
export function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) return Response.json({ error: "unauthorized:auth" }, { status: 401 });
  if (error instanceof NotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
  throw error;
}
