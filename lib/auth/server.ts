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

// The owner's advisors row only has to exist once. Writing it per request put a
// write on one shared row in front of every route, and a card opens ten photos.
let advisorReady: Promise<unknown> | undefined;

/** The shared hackathon owner for route handlers and server actions. Pages use
 *  requirePageUser: its write is what keeps a page out of the prerender. */
export async function requireUser(): Promise<AuthUser> {
  const user = sharedUser();
  advisorReady ??= ensureAdvisor(user).catch((error: unknown) => {
    advisorReady = undefined;
    throw error;
  });
  await advisorReady;
  return user;
}

/** The same shared owner for server components, without a login redirect. */
export async function requirePageUser(): Promise<AuthUser> {
  return getOptionalUser();
}
