// What a get-session answer means for a protected request. Pure, so the
// proxy's outage handling is tested without a network.
//
// Neon Auth's middleware turns every failed session lookup into a sign-in
// redirect, including a transport failure (its proxy answers 502). The proxy
// asks again through `handleAuthProxyRequest` and reads the status here: only
// a confirmed missing or rejected session is a sign-out.

export type SessionVerdict = "signed-in" | "signed-out" | "unavailable";

/** Statuses that say "try again later", not "you are signed out". */
function isOutage(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export function sessionVerdict(status: number, body: unknown): SessionVerdict {
  if (isOutage(status)) return "unavailable";
  if (status < 200 || status >= 300) return "signed-out";
  const session =
    body && typeof body === "object" && "session" in body ? (body as { session: unknown }).session : null;
  return session ? "signed-in" : "signed-out";
}
