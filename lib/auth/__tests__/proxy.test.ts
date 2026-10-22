import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionVerdict } from "../session-probe";

// The proxy with Neon Auth's middleware and session lookup replaced: the
// middleware always redirects to sign-in (what it does on any failed lookup),
// and the probe answers whatever a test sets.

const SESSION_COOKIE = "__Secure-neon-auth.session_token";

const probe = vi.hoisted(() => ({
  respond: (): Promise<Response> => Promise.resolve(Response.json(null)),
}));

vi.mock("@/lib/auth/server", () => ({
  SIGN_IN_PATH: "/sign-in",
  authConfig: { baseUrl: "https://auth.test", cookieSecret: "x".repeat(32) },
  auth: {
    middleware:
      () =>
      async (request: NextRequest): Promise<NextResponse> =>
        NextResponse.redirect(new URL("/sign-in", request.url)),
  },
}));

vi.mock("@neondatabase/auth/server", () => ({
  NEON_AUTH_SESSION_COOKIE_NAME: "__Secure-neon-auth.session_token",
  NEON_AUTH_HEADER_MIDDLEWARE_NAME: "x-neon-auth-middleware",
  handleAuthProxyRequest: () => probe.respond(),
}));

const { proxy } = await import("@/proxy");

function request(path: string, withCookie = true): NextRequest {
  const headers = withCookie ? { cookie: `${SESSION_COOKIE}=abc` } : undefined;
  return new NextRequest(new URL(path, "https://app.test"), { headers });
}

describe("sessionVerdict", () => {
  it("reads outages as unavailable, not as a sign-out", () => {
    for (const status of [0, 408, 429, 500, 502, 503]) expect(sessionVerdict(status, null)).toBe("unavailable");
  });

  it("signs out only on a confirmed missing or rejected session", () => {
    expect(sessionVerdict(401, null)).toBe("signed-out");
    expect(sessionVerdict(403, null)).toBe("signed-out");
    expect(sessionVerdict(200, null)).toBe("signed-out");
    expect(sessionVerdict(200, { session: null, user: null })).toBe("signed-out");
    expect(sessionVerdict(200, { session: { id: "s" }, user: { id: "u" } })).toBe("signed-in");
  });
});

describe("proxy", () => {
  beforeEach(() => {
    probe.respond = () => Promise.resolve(Response.json(null));
  });

  it("redirects a visitor without a session cookie to sign-in with next", async () => {
    const response = await proxy(request("/trips/abc?view=map", false));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe("/trips/abc?view=map");
  });

  it("answers 401 JSON for an API route without a session", async () => {
    const response = await proxy(request("/api/trips/abc", false));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "unauthorized", message: "Sign in to continue." } });
  });

  it("answers 503 instead of signing out when the auth server is unreachable", async () => {
    probe.respond = () =>
      Promise.resolve(Response.json({ error: "Unable to connect", code: "NETWORK_REFUSED" }, { status: 502 }));
    const api = await proxy(request("/api/trips/abc"));
    expect(api.status).toBe(503);
    expect((await api.json()).error.code).toBe("auth_unavailable");

    const page = await proxy(request("/trips/abc"));
    expect(page.status).toBe(503);
    expect(page.headers.get("location")).toBeNull();
  });

  it("answers 503 when the lookup itself throws", async () => {
    probe.respond = () => Promise.reject(new TypeError("fetch failed"));
    expect((await proxy(request("/clients"))).status).toBe(503);
  });

  it("redirects when the auth server confirms there is no session", async () => {
    probe.respond = () => Promise.resolve(Response.json({ session: null, user: null }));
    const response = await proxy(request("/clients"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/sign-in");
  });

  it("lets the request through when the second lookup finds the session", async () => {
    probe.respond = () => Promise.resolve(Response.json({ session: { id: "s" }, user: { id: "u" } }));
    const response = await proxy(request("/clients"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
