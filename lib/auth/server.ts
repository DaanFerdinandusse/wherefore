import "server-only";

import { cache } from "react";

import { ensureAdvisor } from "./advisor";
import { sharedUser } from "./shared-user";

export type AuthUser = {
  userId: string;
  email: string;
  name: string;
  orgIds: string[];
};

// Keep the existing scope contract: every visitor reads and writes one owner.
// No cookies, session lookup, or authentication service is involved.
export const getOptionalUser = cache(async (): Promise<AuthUser> => {
  const user = sharedUser();
  await ensureAdvisor(user);
  return user;
});

/** The shared hackathon owner for route handlers and server actions. */
export async function requireUser(): Promise<AuthUser> {
  return getOptionalUser();
}

/** The same shared owner for server components, without a login redirect. */
export async function requirePageUser(): Promise<AuthUser> {
  return getOptionalUser();
}
