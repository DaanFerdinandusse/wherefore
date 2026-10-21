// Typed errors the data layer throws, and the one mapping from them to HTTP.
// Route handlers wrap their body in try/catch and return `errorResponse(e)`;
// server components use `requirePageUser()` instead, which redirects.
//
// Pure: no server-only import, so tests and client error boundaries can use
// `instanceof` and the codes.

/** No session, or a session the auth server rejected. Maps to 401. */
export class UnauthorizedError extends Error {
  readonly status = 401;
  readonly code = "unauthorized";
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** The auth server could not be reached. Not a sign-out: maps to 503. */
export class AuthUnavailableError extends Error {
  readonly status = 503;
  readonly code = "auth_unavailable";
  constructor(cause?: unknown) {
    super("Sign-in is unavailable right now. Try again in a moment.", { cause });
    this.name = "AuthUnavailableError";
  }
}

/**
 * The row does not exist or is outside the caller's scope. The two are the
 * same answer on purpose, so ids cannot be probed. Maps to 404.
 */
export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = "not_found";
  constructor(readonly entity: string) {
    super(`No ${entity} with that id.`);
    this.name = "NotFoundError";
  }
}

/** Input that names rows from another trip or client, or breaks a rule. Maps to 400. */
export class InvalidInputError extends Error {
  readonly status = 400;
  readonly code = "invalid_input";
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export type AppError = UnauthorizedError | AuthUnavailableError | NotFoundError | InvalidInputError;

export function isAppError(error: unknown): error is AppError {
  return (
    error instanceof UnauthorizedError ||
    error instanceof AuthUnavailableError ||
    error instanceof NotFoundError ||
    error instanceof InvalidInputError
  );
}

/**
 * The response for a typed error: `{ error: { code, message } }` with its
 * status. Anything else is rethrown so Next logs it and answers 500.
 */
export function errorResponse(error: unknown): Response {
  if (isAppError(error)) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  throw error;
}
