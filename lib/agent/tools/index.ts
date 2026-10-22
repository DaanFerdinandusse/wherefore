import { tool } from "ai";
import { z } from "zod";

import type { TurnRef } from "../writes";

import { echoPlacesStep } from "./echo-places";
import {
  findPlacesForModel,
  lookupPlaceForModel,
  removePlaceForModel,
  scorePlacesForModel,
  setItineraryForModel,
  tripContextForModel,
} from "./model-output";
import { slowCountStep } from "./slow-count";
import {
  findPlacesStep,
  getTripContextStep,
  lookupPlaceStep,
  removePlaceStep,
  scorePlacesStep,
  seedTripStep,
  setItineraryStep,
} from "./steps";

// The agent's tools for one turn. Built inside the workflow body: schemas
// are plain data, and each execute is a thin workflow-side closure that calls
// a "use step" function (tools/steps.ts) with serializable arguments: the
// turn, the input, the toolCallId and the abort signal. Retries and
// persistence come from Workflow; every write is conditional on the turn
// (lib/agent/writes.ts).
//
// Each tool returns the full output the card renders (`details`), and
// `toModelOutput` gives the model a compact view of it wrapped as untrusted
// data (`content`, tools/model-output.ts).
//
// The spike tools (echo_places, slow_count) exist only with `devTools`, which
// the turn reads from AGENT_DEV_TOOLS=1 outside production (the chat-lab e2e
// specs). Real turns never see them, so made-up places can not reach a card.

export type ChatToolContext = TurnRef & { devTools?: boolean };

export const SEED_TOOL = "seed_trip";

const categorySchema = z.enum(["eat", "drink", "coffee", "see", "stay"]);
const slotSchema = z.enum(["morning", "lunch", "afternoon", "dinner", "night", "stay"]);

function realTools(turn: TurnRef) {
  return {
    seed_trip: tool({
      description:
        "Build the trip's first list from the travelers' favorites: places to eat, drink, coffee, see and stay, plus the advisor's own places in the city with their scores. Only on the trip's first turn.",
      inputSchema: z.object({}),
      execute: (_input, { toolCallId, abortSignal }) => seedTripStep(turn, toolCallId, abortSignal),
      toModelOutput: ({ output }) => findPlacesForModel(output),
    }),
    get_trip_context: tool({
      description:
        "Load the trip: travelers with their favorites, taste tags and ground rules, the advisor's own places in this city with their scores, board counts, asks and the itinerary.",
      inputSchema: z.object({}),
      execute: () => getTripContextStep(turn.tripId),
      toModelOutput: ({ output }) => tripContextForModel(output),
    }),
    find_places: tool({
      description:
        "Search places for the client that match an ask, for example natural wine bars for Saturday. Adds a tab to the board and the map, scores the advisor's own places for the same ask, and explains each pick.",
      inputSchema: z.object({
        intent: z.string().min(2).max(120).describe("The ask in the advisor's words, without the day, e.g. 'natural wine bars'"),
        category: categorySchema.optional().describe("The board category when it is clear"),
        tags: z.array(z.string().max(60)).max(4).optional().describe("Extra constraints as short phrases, e.g. 'vegetarian'"),
        price_max: z.number().int().min(1).max(4).optional().describe("Highest price level, 1 to 4"),
        area: z.string().max(60).optional().describe("A neighborhood inside the destination"),
        day_hint: z.string().max(30).optional().describe("The day or time, e.g. 'Saturday' or 'day 2 lunch'"),
        take: z.number().int().min(8).max(20).optional().describe("How many places, 8 to 20, default 12"),
      }),
      execute: (input, { toolCallId, abortSignal }) => findPlacesStep(input, turn, toolCallId, abortSignal),
      toModelOutput: ({ output }) => findPlacesForModel(output),
    }),
    score_places: tool({
      description:
        "Score how well places fit the client: trip places by id, places by name (looked up near the destination), or all of the advisor's own places in the city with scope 'advisor_places'.",
      inputSchema: z.object({
        place_ids: z.array(z.string()).max(20).optional(),
        names: z.array(z.string().max(80)).max(10).optional(),
        scope: z.literal("advisor_places").optional(),
      }),
      execute: (input) => scorePlacesStep(input, turn),
      toModelOutput: ({ output }) => scorePlacesForModel(output),
    }),
    lookup_place: tool({
      description:
        "The stored facts about one trip place: descriptions, review keywords, hours, price level, tags, website. Use before describing a place.",
      inputSchema: z.object({ place_id: z.string().describe("The id from a tool result") }),
      execute: (input) => lookupPlaceStep(input, turn),
      toModelOutput: ({ output }) => lookupPlaceForModel(output),
    }),
    set_itinerary: tool({
      description:
        "Put trip places into day slots. 'merge' fills the given slots and keeps the rest; 'replace' clears the itinerary first. Only places on this trip are accepted.",
      inputSchema: z.object({
        days: z
          .array(
            z.object({
              day: z.number().int().min(1).max(60),
              slots: z.array(z.object({ slot: slotSchema, place_id: z.string(), note: z.string().max(200).optional() })).max(10),
            }),
          )
          .min(1)
          .max(30),
        mode: z.enum(["replace", "merge"]),
      }),
      execute: (input) => setItineraryStep(input, turn),
      toModelOutput: ({ output }) => setItineraryForModel(output),
    }),
    remove_place: tool({
      description:
        "Remove a place from the trip. With replace true, the same ask (or the place's category) runs again without it and the next best place is added.",
      inputSchema: z.object({ place_id: z.string(), replace: z.boolean() }),
      execute: (input) => removePlaceStep(input, turn),
      toModelOutput: ({ output }) => removePlaceForModel(output),
    }),
  };
}

function devTools() {
  return {
    echo_places: tool({
      description:
        "Test tool. Returns fake test places for a query in three progress phases. Use only when the user asks for test places or for echo_places.",
      inputSchema: z.object({
        query: z.string().describe("What to search for"),
        fail: z.boolean().optional().describe("Set true only when the user asks to test a failing search"),
      }),
      execute: (input, { toolCallId, abortSignal }) => echoPlacesStep(input, toolCallId, abortSignal),
    }),
    slow_count: tool({
      description: "Test tool. Counts slowly to a number (max 10), one per second. Use only when asked to count slowly.",
      inputSchema: z.object({ to: z.number().int().min(1).max(10).optional() }),
      execute: (input, { toolCallId, abortSignal }) => slowCountStep(input, toolCallId, abortSignal),
    }),
  };
}

export function createChatTools(ctx: ChatToolContext) {
  const turn: TurnRef = { chatId: ctx.chatId, tripId: ctx.tripId, turnId: ctx.turnId };
  return { ...realTools(turn), ...(ctx.devTools ? devTools() : {}) };
}

export type ChatTools = ReturnType<typeof createChatTools>;
export type ChatToolName = keyof ReturnType<typeof realTools> | keyof ReturnType<typeof devTools>;

/** Tools offered on a step: never seed_trip outside the seed turn's first step. */
export function activeToolsFor(
  tools: Record<string, unknown>,
  { seed, stepNumber }: { seed: boolean; stepNumber: number },
): string[] {
  if (seed && stepNumber === 0) return [SEED_TOOL];
  return Object.keys(tools).filter((name) => name !== SEED_TOOL);
}
