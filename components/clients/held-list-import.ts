// A list link waiting for its client. The new client screen has no client to
// import into until it saves one, so it holds the link here and opens the
// profile, which takes it and runs the import with its count on screen. Kept in
// memory and not in the url: a reload must not start the import again.

let held: { clientId: string; link: string } | null = null;

export function holdListImport(clientId: string, link: string): void {
  held = { clientId, link };
}

/** The link held for this client, once. */
export function takeListImport(clientId: string): string | null {
  if (held?.clientId !== clientId) return null;
  const { link } = held;
  held = null;
  return link;
}
