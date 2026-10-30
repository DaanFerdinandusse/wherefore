// The message "Search this region" sends to the chat: a sentence for the
// advisor, then a marker line with the exact circle for the agent. The marker
// stays in the stored text, so a retry and every later turn keep the
// coordinates; the chat bubble and the chat title leave it out. Pure; safe in
// client components and in the tools.

export type MapRegion = { lat: number; lon: number; radiusM: number };

/** The tab of a region search: "Dinner options · Map region". */
export const MAP_REGION_LABEL = "Map region";

const MARKER = /\s*\[map region: lat -?[\d.]+, lon -?[\d.]+, radius \d+ m\]\s*$/;

/** "Search this region of the map for dinner options." plus the marker line. `ask` is what to look for. */
export function mapRegionPrompt(region: MapRegion, ask: string): string {
  return `Search this region of the map for ${ask}.\n[map region: lat ${region.lat.toFixed(5)}, lon ${region.lon.toFixed(5)}, radius ${region.radiusM} m]`;
}

/** A user message as people read it: without the marker line. */
export function withoutRegionMarker(text: string): string {
  return text.replace(MARKER, "");
}
