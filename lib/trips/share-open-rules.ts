// Pure rule for share-open tracking: is this request a person opening the
// link, or a machine looking at it? Link previews (chat apps, mail clients,
// social cards), crawlers and prefetches fetch the page too, and none of them
// means the traveler saw the itinerary.

/** User agents of link previewers and crawlers, matched case-insensitively. */
const MACHINE_AGENTS =
  /bot\b|bot\/|crawler|spider|preview|facebookexternalhit|facebot|whatsapp|slack|discord|telegram|skype|linkedin|pinterest|embedly|vkshare|quora link|outlook|googleimageproxy|yahoo! slurp|headless|lighthouse|curl\/|wget\/|python-requests|node-fetch|undici|go-http-client|okhttp|axios/i;

export type OpenRequest = {
  userAgent: string | null;
  /** `Sec-Purpose` or `Purpose`: "prefetch" for a browser or router prefetch. */
  purpose: string | null;
  /** `Next-Router-Prefetch`: set on a Next client router prefetch. */
  routerPrefetch: string | null;
};

/** True when the request looks like a person opening the link in a browser. */
export function isPersonOpening(request: OpenRequest): boolean {
  if (request.routerPrefetch) return false;
  if (request.purpose && /prefetch|prerender/i.test(request.purpose)) return false;
  const agent = request.userAgent?.trim();
  if (!agent) return false;
  return !MACHINE_AGENTS.test(agent);
}
