import { getToolName, isToolUIPart } from "ai";

import type { AppUIMessage, ItinerarySlot, PlaceVerdict, RecommendPlaceOutput, TripPlaceCard } from "@/lib/contracts";

import { readRecommendOutput } from "./chat-places";

// Pure decisions of the chat column: the composer's placeholder from trip
// facts, which recommendation shows as the full card (the latest; earlier
// picks collapse to one line), and every recommendation by place, so a card
// opened from the itinerary keeps the slot it was recommended for. Tested in
// chat-format.test.ts.

export type Recommendation = RecommendPlaceOutput & { card: TripPlaceCard; toolCallId: string; verdict?: PlaceVerdict };

/** Highest visible match first, preserving result order for ties and unscored places. */
export function placesByMatch(places: readonly TripPlaceCard[]): TripPlaceCard[] {
  return [...places].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/** Pick first, backup next, the places still being read, then the rejected: the order the rows and chips show. */
export function placesByVerdict(places: readonly TripPlaceCard[], verdicts: readonly PlaceVerdict[] | undefined): TripPlaceCard[] {
  if (!verdicts?.length) return placesByMatch(places);
  const stands = new Map(verdicts.map((v) => [v.tripPlaceId, v.stand]));
  const rank = (place: TripPlaceCard) => {
    const stand = stands.get(place.tripPlaceId);
    return stand === "pick" ? 0 : stand === "backup" ? 1 : stand === "out" ? 3 : 2;
  };
  // The rejected keep the order they were let go in, so each one lands at the back.
  const told = new Map(verdicts.map((v, index) => [v.tripPlaceId, index]));
  return places
    .map((place, index) => ({ place, index }))
    .sort((a, b) => rank(a.place) - rank(b.place) || (told.get(a.place.tripPlaceId) ?? a.index) - (told.get(b.place.tripPlaceId) ?? b.index))
    .map((x) => x.place);
}

/** Every recommend_place result in transcript order. */
export function recommendationsOf(messages: readonly AppUIMessage[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.state !== "output-available" || getToolName(part) !== "recommend_place") continue;
      const output = readRecommendOutput(part.output);
      if (output) out.push({ ...output, toolCallId: part.toolCallId });
    }
  }
  return out;
}

/** The tool call of the latest recommendation: the only one shown as the full card in the thread. */
export function liveRecommendationId(messages: readonly AppUIMessage[]): string | undefined {
  return recommendationsOf(messages).at(-1)?.toolCallId;
}

/** The latest recommendation per trip place. */
export function recommendationByPlace(messages: readonly AppUIMessage[]): Map<string, Recommendation> {
  return new Map(recommendationsOf(messages).map((r) => [r.card.tripPlaceId, r]));
}

/** The pick of each ask, for the "Picked" chip of its search row. */
export function picksByAsk(messages: readonly AppUIMessage[]): Map<string, string> {
  const picks = new Map<string, string>();
  for (const r of recommendationsOf(messages)) if (r.askId) picks.set(r.askId, r.card.tripPlaceId);
  return picks;
}

/** The neighborhood most places of the trip are in: itinerary places first, then the rest. */
export function mainNeighborhood(places: readonly TripPlaceCard[], slots: readonly ItinerarySlot[]): string | undefined {
  const planned = new Set(slots.map((s) => s.tripPlaceId).filter(Boolean));
  const pick = (list: readonly TripPlaceCard[]) => {
    const counts = new Map<string, number>();
    for (const p of list) if (p.neighborhood && p.status !== "removed") counts.set(p.neighborhood, (counts.get(p.neighborhood) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  };
  return pick(places.filter((p) => planned.has(p.tripPlaceId))) ?? pick(places);
}

/**
 * The composer's placeholder: the brief while the chat is empty, a nudge to
 * change course while a turn runs, otherwise a change in the trip's own
 * words ("more coffee near Condesa").
 */
export function composerPlaceholder(input: {
  empty: boolean;
  busy: boolean;
  clientName: string;
  destination: string;
  neighborhood?: string;
  openingPlaceholder?: string;
}): string {
  if (input.busy) return "Ask for a change while I search, or stop";
  if (input.empty) {
    const client = input.clientName.trim().split(/\s+/)[0] || input.clientName;
    return input.openingPlaceholder ?? `Tell me what ${client} wants from ${input.destination}`;
  }
  const near = input.neighborhood ? `more coffee near ${input.neighborhood}` : "more coffee nearby";
  return `Ask for a change, like “a quieter lunch” or “${near}”`;
}
