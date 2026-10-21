import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";
import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/lib/db";
import { env } from "@/lib/env";

import { ensureAdvisor } from "./advisor";
import { AuthUnavailableError, UnauthorizedError } from "./errors";

// The Neon Auth (Managed Better Auth) instance and the helpers every route
// handler and server component starts with. Reading the session reads cookies,
// so with Cache Components a component that calls these must sit inside a
// <Suspense> boundary.

export const auth = createNeonAuth({
  baseUrl: env("NEON_AUTH_BASE_URL"),
  cookies: { secret: env("NEON_AUTH_COOKIE_SECRET") },
});

export type AuthUser = {
  userId: string;
  email: string;
  name: string;
  /** Neon Auth organizations the user is a member of. Empty until teams ship. */
  orgIds: string[];
};

export const SIGN_IN_PATH = "/sign-in";

// One advisors upsert per user per server instance, not per request.
const ensuredAdvisors = new Set<string>();

type MemberRow = { id: string };

/**
 * The signed-in user, or null when there is no valid session. Throws
 * `AuthUnavailableError` when the auth server cannot be reached: an outage is
 * not a sign-out. Memoized per request in server components.
 */
export const getOptionalUser = cache(async (): Promise<AuthUser | null> => {
  let result: Awaited<ReturnType<typeof auth.getSession>>;
  try {
    result = await auth.getSession();
  } catch (error) {
    throw new AuthUnavailableError(error);
  }
  const { data, error } = result;
  if (error) {
    if (error.status >= 500 || error.status === 0) throw new AuthUnavailableError(error);
    return null;
  }
  const user = data?.user;
  if (!user?.id) return null;

  const authUser: AuthUser = {
    userId: user.id,
    email: user.email,
    name: user.name ?? "",
    orgIds: [],
  };

  // Org membership lives in Neon Auth's own schema in this database.
  const members = await db.execute<MemberRow>(
    sql`select "organizationId"::text as id from neon_auth.member where "userId"::text = ${user.id}`,
  );
  authUser.orgIds = members.rows.map((row) => row.id);

  if (!ensuredAdvisors.has(user.id)) {
    await ensureAdvisor(authUser);
    ensuredAdvisors.add(user.id);
  }
  return authUser;
});

/**
 * The signed-in user for a route handler or server action. Throws
 * `UnauthorizedError` (map it with `errorResponse`, which answers 401).
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getOptionalUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** The signed-in user for a server component; redirects to /sign-in otherwise. */
export async function requirePageUser(): Promise<AuthUser> {
  const user = await getOptionalUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user;
}
