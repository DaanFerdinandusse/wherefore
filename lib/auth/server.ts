import "server-only";

import { UnauthorizedError } from "./errors";

// PLACEHOLDER written by the chat runtime branch so its routes compile and run
// before the auth branch lands. The real module (Neon Auth) replaces this file
// on merge; the signature matches it (requireUser(): Promise<AuthUser>, throws
// UnauthorizedError without a session).

export type AuthUser = { userId: string; email: string; name: string; orgIds: string[] };

export const DEV_USER_ID = "dev-user";

/** @throws UnauthorizedError in production, where this placeholder has no session to read. */
export async function requireUser(): Promise<AuthUser> {
  if (process.env.NODE_ENV === "production") throw new UnauthorizedError();
  return { userId: DEV_USER_ID, email: "dev@tastebrief.local", name: "Dev Advisor", orgIds: [] };
}
