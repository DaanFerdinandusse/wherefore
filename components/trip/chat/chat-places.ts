import { isToolUIPart } from "ai";
import { z } from "zod";

import type { AppUIMessage, FindPlacesOutput, TripPlaceCard } from "@/lib/contracts";

// Places carried by tool parts (preliminary and final outputs), so the board
// and the map can show cards before the model finishes talking. Pure; the
// hook in use-chat-places.ts memoizes it over useChat's messages.

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

/** The FindPlacesOutput inside a tool output, or undefined when it is not one. */
export function readPlacesOutput(output: unknown): FindPlacesOutput | undefined {
  const parsed = placesOutputSchema.safeParse(output);
  return parsed.success ? (parsed.data as unknown as FindPlacesOutput) : undefined;
}

/**
 * Every place shown by a tool part across the transcript, in first-seen
 * order; a later output of the same trip place replaces the earlier copy.
 */
export function extractChatPlaces(messages: AppUIMessage[]): TripPlaceCard[] {
  const byId = new Map<string, TripPlaceCard>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      const output = readPlacesOutput(part.output);
      if (!output) continue;
      for (const place of output.places) byId.set(place.tripPlaceId, place);
    }
  }
  return [...byId.values()];
}
