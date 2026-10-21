import { NextResponse, type NextRequest } from "next/server";

import { auth, SIGN_IN_PATH } from "@/lib/auth/server";

// Next 16 proxy (formerly middleware). Neon Auth's middleware refreshes the
// session cookie, finishes the Google OAuth exchange, and redirects signed-out
// visitors. Two adjustments: API routes answer 401 JSON instead of a redirect,
// and page redirects carry `next` so sign-in can return the advisor to it.
//
// This is not authorization. Every route handler still starts with
// requireUser(), and every query filters by owner.

const neonMiddleware = auth.middleware({ loginUrl: SIGN_IN_PATH });

function isLoginRedirect(response: NextResponse, request: NextRequest): boolean {
  const location = response.headers.get("location");
  if (!location || response.status < 300 || response.status >= 400) return false;
  return new URL(location, request.url).pathname === SIGN_IN_PATH;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = await neonMiddleware(request);
  if (!isLoginRedirect(response, request)) return response;

  const { pathname, search } = request.nextUrl;
  const replacement = pathname.startsWith("/api/")
    ? NextResponse.json(
        { error: { code: "unauthorized", message: "Sign in to continue." } },
        { status: 401 },
      )
    : (() => {
        const url = new URL(SIGN_IN_PATH, request.url);
        url.searchParams.set("next", `${pathname}${search}`);
        return NextResponse.redirect(url);
      })();

  // Keep the stale-cookie cleanup Neon Auth attached to its redirect.
  for (const cookie of response.headers.getSetCookie()) {
    replacement.headers.append("set-cookie", cookie);
  }
  return replacement;
}

// Route groups are not in URLs. /s/* (traveler view), /api/auth/* and
// /api/health/* stay public. Matchers must be static literals.
export const config = {
  matcher: [
    "/trips/:path*",
    "/clients/:path*",
    "/places/:path*",
    "/api/(chats|trips|places|search|import)/:path*",
  ],
};
