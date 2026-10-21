import { auth } from "@/lib/auth/server";

// The Neon Auth proxy: sign-in, sign-up, OAuth callbacks, session reads. The
// segment must be named `path`; that is the param the handler reads.
export const { GET, POST, PUT, PATCH, DELETE } = auth.handler();
