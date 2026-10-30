import { tool } from "ai";
import { z } from "zod";

import { SLOT_ORDER } from "@/lib/trips/day-parts";

import type { TurnRef } from "../writes";

import { echoPlacesStep } from "./echo-places";
import {
  findPlacesForModel,
  lookupPlaceForModel,
  modelText,
  recommendPlaceForModel,
  removePlaceForModel,
  scorePlacesForModel,
  setItineraryForModel,
  tripContextForModel,
  type ModelText,
} from "./model-output";
import { slowCountStep } from "./slow-count";
import {
  findPlacesStep,
  getTripContextStep,
  lookupPlaceStep,
  recommendPlaceStep,
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
const slotSchema = z.enum(SLOT_ORDER);

const PLACE_REF = "The advisor's words when they name the place, e.g. 'Cura'. Otherwise the id from a tool result.";

const targetSchema = z
  .object({
    day: z.number().int().min(1).max(60).describe("Trip day number, 1 is the first day"),
    slot: slotSchema,
  })
  .describe("The itinerary slot this is for, when the advisor named one (Friday dinner is the day of that Friday, slot dinner)");

/**
 * The first-turn seed (seed_trip) is retired in v3: a new trip waits for the
 * advisor's brief. The tool body stays for the dev labs (seedTripStep), and
 * saved seed_trip parts still convert for history (historyTools).
 */
export function seedTool(turn: TurnRef) {
  return tool({
    description: "Build the trip's first list. Dev labs only.",
    inputSchema: z.object({}),
    execute: (_input, { toolCallId, abortSignal }) => seedTripStep(turn, toolCallId, abortSignal),
    toModelOutput: ({ output }) => findPlacesForModel(output),
  });
}

function realTools(turn: TurnRef) {
  return {
    get_trip_context: tool({
      description:
        "Load the trip: travelers with their favorites, taste tags and ground rules, the advisor's own places in this city with their scores, board counts, asks and the itinerary.",
      inputSchema: z.object({}),
      execute: () => getTripContextStep(turn.tripId),
      toModelOutput: ({ output }) => tripContextForModel(output),
    }),
    find_places: tool({
      description:
        "Look at a few places for one slot or one kind of place, for example seafood restaurants for Friday dinner. Small on purpose: about 5 candidates, scored for the client, the advisor's own places included when they fit. Stays close to the trip by itself: it searches around the places already on that day, else the hotel, else the middle of the itinerary, else the city center, so never work out coordinates. Shows a row of places in the chat. Follow it with recommend_place for the best one, unless every candidate conflicts with a ground rule.",
      inputSchema: z.object({
        intent: z.string().min(2).max(120).describe("The ask in the advisor's words, without the day, e.g. 'seafood restaurants'"),
        category: categorySchema
          .optional()
          .describe("The board category when it is clear. Leave it out for any other kind of place, such as shopping malls or spas"),
        tags: z
          .array(z.string().max(60))
          .optional()
          .describe("Up to 4 of the advisor's own words as short phrases, e.g. 'seafood', 'lively'. Not the client's taste: the favorites already drive the search"),
        price_max: z.number().int().min(1).max(4).optional().describe("Highest price level, 1 to 4"),
        area: z.string().max(60).optional().describe("A neighborhood inside the destination"),
        near: z
          .object({
            lat: z.number().min(-90).max(90),
            lon: z.number().min(-180).max(180),
            radius_m: z.number().int().min(100).max(100_000),
          })
          .optional()
          .describe("The exact circle to search, copied from a [map region: ...] line. Use it instead of area."),
        around_place_id: z.string().optional().describe(`Search around this place: 'near Contramar'. ${PLACE_REF}`),
        around_day: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("Search around this trip day's places when the ask has no slot. With target this happens on its own."),
        radius_m: z
          .number()
          .int()
          .min(300)
          .max(100_000)
          .optional()
          .describe("How far the search may reach. Only when the advisor says how far, e.g. 1000 for walking distance, 25000 for anywhere in the city."),
        day_hint: z.string().max(30).optional().describe("The day or time when it is not a slot, e.g. 'Saturday'. On a trip without dates, the weekday of the target too"),
        target: targetSchema.optional(),
        discovery: z
          .literal("less_known")
          .optional()
          .describe("'less_known' keeps to places off the usual list. Use it when the brief asks for that, and for at least one pick when planning several slots"),
        michelin: z.boolean().optional().describe("True keeps to places Michelin lists. Only when the advisor asks for Michelin"),
        take: z.number().int().min(3).max(8).optional().describe("How many candidates, 3 to 8, default 5"),
      }),
      execute: (input, { toolCallId, abortSignal }) => findPlacesStep(input, turn, toolCallId, abortSignal),
      toModelOutput: ({ output }) => findPlacesForModel(output),
    }),
    recommend_place: tool({
      description:
        "Recommend one place from a search result as the pick for the client. The chat shows it as a full place card with photos, the match and visit facts, and buttons to add it or drop it. Call once per search, right after find_places, with the best fit for the brief, the ground rules and the facts on each candidate. Skip it when every candidate conflicts with a ground rule. Does not change the itinerary.",
      inputSchema: z.object({
        place_id: z.string().describe("The id of a place from the search result"),
        ask_id: z.string().optional().describe("The ask_id of that search"),
        target: targetSchema.optional(),
      }),
      execute: (input) => recommendPlaceStep(input, turn),
      toModelOutput: ({ output }) => recommendPlaceForModel(output),
    }),
    score_places: tool({
      description:
        "Score how well places fit the client: trip places by id, places by name (looked up near the destination), or all of the advisor's own places in the city with scope 'advisor_places'.",
      inputSchema: z.object({
        place_ids: z.array(z.string()).max(20).optional(),
        names: z.array(z.string().max(80)).max(10).optional(),
        scope: z.literal("advisor_places").optional(),
      }),
      execute: (input, { toolCallId }) => scorePlacesStep(input, turn, toolCallId),
      toModelOutput: ({ output }) => scorePlacesForModel(output),
    }),
    lookup_place: tool({
      description:
        "The stored facts about one trip place: descriptions, review keywords, hours, price level, tags, website. Use before describing a place.",
      inputSchema: z.object({ place_id: z.string().describe(PLACE_REF) }),
      execute: (input) => lookupPlaceStep(input, turn),
      toModelOutput: ({ output }) => lookupPlaceForModel(output),
    }),
    set_itinerary: tool({
      description:
        "Put trip places into day slots. A meal (breakfast, lunch, dinner) holds one restaurant or cafe. Morning, afternoon and night hold any number of sights, bars and cafes, in the order given, so a museum next to lunch goes in afternoon. A place in a slot that may not hold it is rejected. 'merge' fills the given slots, adds to morning, afternoon and night, and keeps the rest; 'replace' clears the itinerary first. Only places on this trip are accepted.",
      inputSchema: z.object({
        days: z
          .array(
            z.object({
              day: z.number().int().min(1).max(60),
              slots: z
                .array(
                  z.object({
                    slot: slotSchema,
                    place_id: z.string().describe(PLACE_REF),
                    note: z
                      .string()
                      .max(200)
                      .optional()
                      .describe("A short note for the advisor only, never shown to the traveler. No hours, prices or reservations."),
                  }),
                )
                .max(10),
            }),
          )
          .min(1)
          .max(30),
        mode: z.enum(["replace", "merge"]),
      }),
      execute: (input, { toolCallId }) => setItineraryStep(input, turn, toolCallId),
      toModelOutput: ({ output }) => setItineraryForModel(output),
    }),
    remove_place: tool({
      description:
        "Remove a place from the trip. With replace true, the same ask (or the place's category) runs again without it and the next best place is added.",
      inputSchema: z.object({
        place_id: z.string().describe(PLACE_REF),
        replace: z.boolean(),
      }),
      execute: (input, { toolCallId }) => removePlaceStep(input, turn, toolCallId),
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

/** A tool for history conversion only: no execute, a toModelOutput that never throws on an old output shape. */
function forHistory<T>(project: (output: T) => ModelText) {
  return tool({
    inputSchema: z.unknown(),
    toModelOutput: ({ output }) => {
      try {
        return project(output as T);
      } catch {
        return modelText({ note: "An older result that can no longer be shown. Call the tool again if you need it." });
      }
    },
  });
}

/**
 * The tools as toModelHistory needs them: only each tool's model view, so a
 * saved output goes back to the model as the same compact <trip_data> copy
 * it saw when the tool ran (messages.ts). Pure, safe in any step.
 */
export function historyTools() {
  return {
    seed_trip: forHistory(findPlacesForModel),
    get_trip_context: forHistory(tripContextForModel),
    find_places: forHistory(findPlacesForModel),
    recommend_place: forHistory(recommendPlaceForModel),
    score_places: forHistory(scorePlacesForModel),
    lookup_place: forHistory(lookupPlaceForModel),
    set_itinerary: forHistory(setItineraryForModel),
    remove_place: forHistory(removePlaceForModel),
  };
}

export function createChatTools(ctx: ChatToolContext) {
  const turn: TurnRef = { chatId: ctx.chatId, tripId: ctx.tripId, turnId: ctx.turnId };
  return { ...realTools(turn), ...(ctx.devTools ? devTools() : {}) };
}

export type ChatTools = ReturnType<typeof createChatTools>;
export type ChatToolName = keyof ReturnType<typeof realTools> | keyof ReturnType<typeof devTools>;

/** Tools offered on a step: every tool of the turn, never seed_trip (retired in v3). */
export function activeToolsFor(tools: Record<string, unknown>): string[] {
  return Object.keys(tools).filter((name) => name !== SEED_TOOL);
}
