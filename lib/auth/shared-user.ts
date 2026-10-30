import "server-only";

import type { AuthUser } from "./server";

/** One stable workspace across browsers, requests, and server restarts. */
export function sharedUser(): AuthUser {
  return {
    userId: "tastebrief-demo",
    email: "",
    name: "Demo advisor",
    orgIds: [],
  };
}
