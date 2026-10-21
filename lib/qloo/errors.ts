// The failure space of the recommendation client as classes, so callers branch
// on `instanceof` and never on message text. Messages are for logs and the
// agent, not for the UI: the UI maps these to its own copy.

export class QlooError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** QLOO_API_KEY or QLOO_API_URL is missing on the server. */
export class QlooNotConfiguredError extends QlooError {
  constructor(variable: string) {
    super(`Recommendation API is not configured: set ${variable} in the server env`);
  }
}

/** A param that is not on the endpoint's allowlist, or a value of the wrong shape.
 *  Thrown before any request, because the upstream silently ignores typos and
 *  answers with a generic list. */
export class QlooParamError extends QlooError {
  constructor(
    readonly endpoint: string,
    readonly param: string,
    reason: string,
  ) {
    super(`${endpoint}: ${param} ${reason}`);
  }
}

/** A non 2xx answer. 4xx is never retried; 5xx is retried once before this. */
export class QlooHttpError extends QlooError {
  constructor(
    readonly endpoint: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${endpoint} answered HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

/** The network failed or the request timed out (after the one retry). */
export class QlooNetworkError extends QlooError {
  constructor(
    readonly endpoint: string,
    cause: unknown,
  ) {
    super(`${endpoint} could not be reached`, { cause });
  }
}

/** The answer is missing a field this app relies on. Fails loudly so a changed
 *  upstream shows up at the first call, not as empty cards. */
export class QlooSchemaError extends QlooError {
  constructor(
    readonly endpoint: string,
    readonly issues: string,
  ) {
    super(`${endpoint} answered in an unexpected shape: ${issues}`);
  }
}

/** The results are not in the requested destination (the geocoder picked another
 *  place with the same name, or the point is wrong). */
export class QlooLocalityMismatchError extends QlooError {
  constructor(
    readonly requested: string,
    readonly resolved: string,
  ) {
    super(`Asked for places in ${requested} but the results are in ${resolved}`);
  }
}
