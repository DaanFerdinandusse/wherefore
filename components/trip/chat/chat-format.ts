import { getToolName, isToolUIPart } from "ai";

import type { AppUIMessage, RecommendPlaceOutput, TripPlaceCard } from "@/lib/contracts";

import { readRecommendOutput } from "./chat-places";

// Pure decisions of the chat column: the composer's placeholder, which
// recommendation shows as the full card (the latest; earlier
// picks collapse to one line), and every recommendation by place, so a card
// opened from the itinerary keeps the slot it was recommended for. Tested in
// chat-format.test.ts.

export type Recommendation = RecommendPlaceOutput & { card: TripPlaceCard; toolCallId: string };

/** Highest visible match first, preserving result order for ties and unscored places. */
export function placesByMatch(places: readonly TripPlaceCard[]): TripPlaceCard[] {
  return [...places].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
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

/**
 * The composer's placeholder: the brief while the chat is empty, otherwise a
 * plain line until a suggestion is ready to take its place.
 */
export function composerPlaceholder(input: {
  empty: boolean;
  clientName: string;
  destination: string;
  openingPlaceholder?: string;
}): string {
  if (!input.empty) return "Ask anything ...";
  const client = input.clientName.trim().split(/\s+/)[0] || input.clientName;
  return input.openingPlaceholder ?? `Tell me what ${client} wants from ${input.destination}`;
}
