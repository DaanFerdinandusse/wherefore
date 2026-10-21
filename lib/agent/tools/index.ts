import { tool } from "ai";
import { z } from "zod";

import { echoPlacesStep } from "./echo-places";
import { getTripContextStep } from "./get-trip-context";
import { slowCountStep } from "./slow-count";

// The agent's tools for one turn. Built inside the workflow body: schemas
// are plain data, and each execute is a thin workflow-side closure that calls
// a "use step" function with serializable arguments (ids, input, the
// toolCallId and the abort signal), so retries and persistence come from
// Workflow. New tools: add the step in its own file, then a line here, then
// (only if it earns one) a card branch in components/trip/chat/tool-card.tsx.

export type ChatToolContext = { chatId: string; tripId: string; turnId: string };

export function createChatTools(ctx: ChatToolContext) {
  return {
    get_trip_context: tool({
      description:
        "Load the trip: travelers with their favorites, taste tags and ground rules, the advisor's own places in this city, the board counts, asks and the itinerary.",
      inputSchema: z.object({}),
      execute: () => getTripContextStep(ctx.tripId),
    }),
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

export type ChatTools = ReturnType<typeof createChatTools>;
