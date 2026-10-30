// Where C1 New client goes after saving. The New trip panel opens it with
// ?return=<its own url>; saving goes back there with client=<new id>, so the
// panel reopens with the new client chosen. Pure.

/** The return url when it is a path on this site, else null (never an open redirect). */
export function safeReturn(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) return null;
  try {
    const url = new URL(trimmed, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** `href` with client=<id> set (replacing one already there). */
export function withClient(href: string, clientId: string): string {
  const url = new URL(href, "http://local.invalid");
  url.searchParams.set("client", clientId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Where "Save and plan a trip" goes: back to the panel that asked, else the New trip panel over the Clients list. */
export function planTripHref(returnTo: string | null, clientId: string): string {
  if (returnTo) {
    const url = new URL(withClient(returnTo, clientId), "http://local.invalid");
    url.searchParams.set("new", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return `/clients?new=1&client=${encodeURIComponent(clientId)}`;
}
