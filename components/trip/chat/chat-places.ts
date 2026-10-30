import { getToolName, isToolUIPart } from "ai";
import { z } from "zod";

import type { AppUIMessage, FindPlacesOutput, RecommendPlaceOutput, SlotName, TripPlaceCard } from "@/lib/contracts";

import type { PlacesMeta } from "../contracts";

// Places carried by tool parts (preliminary and final outputs), so the board
// and the map can show cards before the model finishes talking. Pure; the
// hook in use-chat-places.ts memoizes it over useChat's messages.
//
// Only the product tools count (find_places, seed_trip, recommend_place, and
// the replacement of remove_place). The spike tools (echo_places) return made-up places for
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

const targetSchema = z.object({
  day: z.number(),
  slot: z.enum(["morning", "lunch", "afternoon", "dinner", "night", "stay"]),
  label: z.string(),
  date: z.string().optional(),
});

const recommendOutputSchema = z.looseObject({
  card: placeSchema,
  askId: z.string().optional(),
  target: targetSchema.optional(),
  clientFirstName: z.string().optional(),
  clientNote: z.object({ text: z.string(), matches: z.array(z.string()) }).optional(),
});

/** The RecommendPlaceOutput inside a recommend_place output, when it carries a card. */
export function readRecommendOutput(output: unknown): (RecommendPlaceOutput & { card: TripPlaceCard }) | undefined {
  const parsed = recommendOutputSchema.safeParse(output);
  return parsed.success ? (parsed.data as unknown as RecommendPlaceOutput & { card: TripPlaceCard }) : undefined;
}

/** One batch of places from one tool output, for ChatDockProps.onPlaces. */
export type ToolPlacesEvent = {
  toolCallId: string;
  askId?: string;
  phase: string;
  places: TripPlaceCard[];
  label?: string;
  count?: number;
  elapsedMs?: number;
  loosened?: string[];
  /** The slot the ask is for. */
  target?: { day: number; slot: SlotName };
  /** recommend_place: the ask's one pick. */
  pickTripPlaceId?: string;
  /** Changes whenever the output does: tool call, phase, count, preliminary. */
  key: string;
};

/** The meta the workspace's onPlaces takes, from an event. */
export function placesMetaOf(event: ToolPlacesEvent): PlacesMeta {
  return {
    toolCallId: event.toolCallId,
    phase: event.phase,
    ...(event.askId ? { askId: event.askId } : {}),
    ...(event.label ? { label: event.label } : {}),
    ...(event.count !== undefined ? { count: event.count } : {}),
    ...(event.elapsedMs !== undefined ? { elapsedMs: event.elapsedMs } : {}),
    ...(event.loosened ? { loosened: event.loosened } : {}),
    ...(event.target ? { target: event.target } : {}),
    ...(event.pickTripPlaceId ? { pickTripPlaceId: event.pickTripPlaceId } : {}),
  };
}

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
          label: output.label,
          count: output.count,
          elapsedMs: output.elapsedMs,
          loosened: output.loosened,
          ...(output.target ? { target: { day: output.target.day, slot: output.target.slot } } : {}),
          key: `${part.toolCallId}|${output.phase}|${output.places.length}|${reasons}|${preliminary}`,
        });
      } else if (name === "recommend_place") {
        const output = readRecommendOutput(part.output);
        if (!output) continue;
        events.push({
          toolCallId: part.toolCallId,
          ...(output.askId ? { askId: output.askId } : {}),
          phase: "done",
          places: [output.card],
          ...(output.target ? { target: { day: output.target.day, slot: output.target.slot } } : {}),
          pickTripPlaceId: output.card.tripPlaceId,
          key: `${part.toolCallId}|done|1|${preliminary}`,
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
