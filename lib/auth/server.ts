import "server-only";

// PLACEHOLDER. The auth agent owns this file; the integrator replaces it with
// the real Neon Auth version. It exists so the place routes compile in this
// worktree. Until then every guarded route refuses the request.

export type SessionUser = { id: string; email?: string; name?: string };

export async function requireUser(): Promise<SessionUser> {
  throw new Error("requireUser is a placeholder: lib/auth/server.ts has not been merged yet");
}
