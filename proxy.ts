import {
  handleAuthProxyRequest,
  NEON_AUTH_HEADER_MIDDLEWARE_NAME,
  NEON_AUTH_SESSION_COOKIE_NAME,
} from "@neondatabase/auth/server";
import { NextResponse, type NextRequest } from "next/server";

import { AuthUnavailableError } from "@/lib/auth/errors";
import { auth, authConfig, SIGN_IN_PATH } from "@/lib/auth/server";
import { sessionVerdict, type SessionVerdict } from "@/lib/auth/session-probe";

// Next 16 proxy (formerly middleware). Neon Auth's middleware refreshes the
// session cookie, finishes the Google OAuth exchange, and redirects signed-out
// visitors. Three adjustments: API routes answer 401 JSON instead of a
// redirect, page redirects carry `next` so sign-in can return the advisor to
// it, and an auth outage answers 503 instead of signing the advisor out.
//
// Neon Auth 0.7's middleware does not say why it redirects: a failed session
// lookup (its proxy answers 502 on a network error) reads as "no session". So
// when it redirects a request that carries a session cookie, we ask once more
// through `handleAuthProxyRequest` and only redirect on a confirmed missing or
// rejected session. A request without a session cookie is signed out for sure
// and costs no extra call.
//
// This is not authorization. Every route handler still starts with
// requireUser(), and every query filters by owner.

const neonMiddleware = auth.middleware({ loginUrl: SIGN_IN_PATH });

function isLoginRedirect(response: NextResponse, request: NextRequest): boolean {
  const location = response.headers.get("location");
  if (!location || response.status < 300 || response.status >= 400) return false;
  return new URL(location, request.url).pathname === SIGN_IN_PATH;
}

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.has(NEON_AUTH_SESSION_COOKIE_NAME);
}

/** A second, error-aware session lookup. Network failures read as an outage. */
async function probeSession(request: NextRequest): Promise<{ verdict: SessionVerdict; cookies: string[] }> {
  const headers = new Headers(request.headers);
  for (const name of ["content-type", "content-length", "transfer-encoding"]) headers.delete(name);
  try {
    const response = await handleAuthProxyRequest({
      request: new Request(request.url, { method: "GET", headers }),
      path: "get-session",
      baseUrl: authConfig.baseUrl,
      cookieSecret: authConfig.cookieSecret,
    });
    const body: unknown = response.ok ? await response.json().catch(() => null) : null;
    return { verdict: sessionVerdict(response.status, body), cookies: response.headers.getSetCookie() };
  } catch {
    return { verdict: "unavailable", cookies: [] };
  }
}

function unavailable(request: NextRequest): NextResponse {
  const message = new AuthUnavailableError().message;
  const headers = { "retry-after": "30", "cache-control": "no-store" };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "auth_unavailable", message } }, { status: 503, headers });
  }
  return new NextResponse(message, {
    status: 503,
    headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
  });
}

function signedOut(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in to continue." } },
      { status: 401 },
    );
  }
  const url = new URL(SIGN_IN_PATH, request.url);
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

/** What Neon Auth's middleware does when it lets a request through. */
function allow(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(NEON_AUTH_HEADER_MIDDLEWARE_NAME, "true");
  return NextResponse.next({ request: { headers } });
}

function withCookies(response: NextResponse, cookies: string[]): NextResponse {
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = await neonMiddleware(request);
  if (!isLoginRedirect(response, request)) return response;

  // Keep the stale-cookie cleanup Neon Auth attached to its redirect.
  const neonCookies = response.headers.getSetCookie();
  if (!hasSessionCookie(request)) return withCookies(signedOut(request), neonCookies);

  const probe = await probeSession(request);
  switch (probe.verdict) {
    case "unavailable":
      return unavailable(request);
    case "signed-in":
      // The first lookup failed and the second worked: let the request through.
      return withCookies(allow(request), probe.cookies);
    case "signed-out":
      return withCookies(signedOut(request), [...neonCookies, ...probe.cookies]);
  }
}

// Route groups are not in URLs. /s/* (traveler view), /api/auth/* and
// /api/health/* stay public. Matchers must be static literals.
export const config = {
  matcher: [
    "/trips/:path*",
    "/clients/:path*",
    "/places/:path*",
    "/api/(chats|trips|places|search|import|advisor-places|entities|localities|trip-places|clients|nav)/:path*",
  ],
};
