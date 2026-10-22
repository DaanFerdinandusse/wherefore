import { getToolName, isToolUIPart } from "ai";
import { z } from "zod";

import type { AppUIMessage, FindPlacesOutput, TripPlaceCard } from "@/lib/contracts";

// Places carried by tool parts (preliminary and final outputs), so the board
// and the map can show cards before the model finishes talking. Pure; the
// hook in use-chat-places.ts memoizes it over useChat's messages.
//
// Only the product tools count (find_places, seed_trip, and the replacement
// of remove_place). The spike tools (echo_places) return made-up places for
// the e2e specs; their cards still render in the dock, but their places
// never reach the board or the map.

export const PLACE_TOOLS = new Set(["find_places", "seed_trip"]);

const placeSchema = z.looseObject({
  tripPlaceId: z.string(),
  placeId: z.string(),
  name: z.string(),
  category: z.enum(["eat", "drink", "coffee", "see", "stay", "other"]),
});

const placesOutputSchema = z.looseObject({
  phase: z.string(),
  label: z.string(),
  places: z.array(placeSchema),
});

const removeOutputSchema = z.looseObject({ replacement: placeSchema.optional() });

/** The FindPlacesOutput inside a tool output, or undefined when it is not one. */
export function readPlacesOutput(output: unknown): FindPlacesOutput | undefined {
  const parsed = placesOutputSchema.safeParse(output);
  return parsed.success ? (parsed.data as unknown as FindPlacesOutput) : undefined;
}

/** One batch of places from one tool output, for ChatDockProps.onPlaces. */
export type ToolPlacesEvent = {
  toolCallId: string;
  askId?: string;
  phase: string;
  places: TripPlaceCard[];
  /** Changes whenever the output does: tool call, phase, count, preliminary. */
  key: string;
};

/** Every product tool output that carries places, in transcript order. */
export function toolPlaceEvents(messages: AppUIMessage[]): ToolPlacesEvent[] {
  const events: ToolPlacesEvent[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      const name = getToolName(part);
      const preliminary = part.preliminary ? "p" : "f";
      if (PLACE_TOOLS.has(name)) {
        const output = readPlacesOutput(part.output);
        if (!output) continue;
        const reasons = output.places.filter((p) => p.reason).length;
        events.push({
          toolCallId: part.toolCallId,
          askId: output.askId,
          phase: output.phase,
          places: output.places,
          key: `${part.toolCallId}|${output.phase}|${output.places.length}|${reasons}|${preliminary}`,
        });
      } else if (name === "remove_place") {
        const parsed = removeOutputSchema.safeParse(part.output);
        const replacement = parsed.success ? (parsed.data.replacement as TripPlaceCard | undefined) : undefined;
        if (!replacement) continue;
        events.push({
          toolCallId: part.toolCallId,
          phase: "done",
          places: [replacement],
          key: `${part.toolCallId}|done|1|${preliminary}`,
        });
      }
    }
  }
  return events;
}

/**
 * Every place shown by a product tool across the transcript, in first-seen
 * order; a later output of the same trip place replaces the earlier copy.
 */
export function extractChatPlaces(messages: AppUIMessage[]): TripPlaceCard[] {
  const byId = new Map<string, TripPlaceCard>();
  for (const event of toolPlaceEvents(messages)) {
    for (const place of event.places) byId.set(place.tripPlaceId, place);
  }
  return [...byId.values()];
}
