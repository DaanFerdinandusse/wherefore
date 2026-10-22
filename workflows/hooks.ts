import { defineHook } from "workflow";
import { z } from "zod";

// The stop signal for a running turn. Created by the workflow with the token
// stopTokenFor(turnId); resumed by POST /api/chats/[chatId]/stop.
export const stopHook = defineHook({
  schema: z.object({ reason: z.string().max(200).optional() }),
});

export function stopTokenFor(turnId: string): string {
  return `stop:${turnId}`;
}
