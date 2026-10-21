// Failure space of the Google Places client. Routes map these to HTTP codes.

export class GoogleError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** GOOGLE_PLACES_SERVER_KEY is not set. Everything else in the app still works;
 *  only the profile's Google section and photos are unavailable. */
export class GoogleNotConfiguredError extends GoogleError {
  constructor() {
    super("Google Places is not configured: set GOOGLE_PLACES_SERVER_KEY in the server env");
  }
}

export class GoogleApiError extends GoogleError {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Google Places answered HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

export class GoogleSchemaError extends GoogleError {
  constructor(readonly issues: string) {
    super(`Google Places answered in an unexpected shape: ${issues}`);
  }
}

/** A place id or photo name that does not look like one. Checked before any
 *  request so the proxy cannot be pointed at another path. */
export class GoogleInputError extends GoogleError {}
