// PLACEHOLDER from the UI shell branch so app/(app)/layout.tsx compiles.
// The auth owner replaces this file with the real Neon Auth module; keep the
// getOptionalUser() name and the { name, email } shape.
import "server-only";

export type SessionUser = { name: string; email: string };

export async function getOptionalUser(): Promise<SessionUser | null> {
  return { name: "Daan", email: "" };
}
