"use client";

import { createAuthClient } from "@neondatabase/auth/next";

// Browser auth client. Every call goes through our own /api/auth/[...path]
// proxy, so the Neon Auth URL and cookie secret never reach the bundle.
export const authClient = createAuthClient();
