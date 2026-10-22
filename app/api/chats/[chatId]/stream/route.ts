import { createUIMessageStreamResponse } from "ai";

import { loadOwnedChat, streamQuerySchema } from "@/lib/agent/chat-routes";
import { chatRoute } from "@/lib/agent/route-handler";
import { resolveStreamBinding } from "@/lib/agent/turn-state";
import { turnUIStream } from "@/lib/agent/turn-stream";

// GET /api/chats/[chatId]/stream?startIndex=n: re-attach to the running turn.
//
// The run is resolved server side from chats.active_run_id, so any tab can
// attach. `startIndex` counts UI chunks the client already has
// (WorkflowChatTransport appends it to the URL itself); the run's stream is
// replayed from 0 and that many chunks are skipped.
//
// Binding: a cursor only means something for the run it was counted on. The
// client names that run with the `x-chat-run-id` header (or `?runId=` /
// `?turnId=`). Answers:
//   - 200 the run's UI stream, when the named run is the active one (or none is named);
//   - 204 the chat is idle;
//   - 205 with `x-chat-stream: reset` and `x-chat-active-run-id`: the chat
//     moved on to another run; drop the cursor, re-read the transcript and
//     attach from chunk 0.
export const GET = chatRoute(async ({ request, chatId, user }) => {
  const row = await loadOwnedChat(chatId, user);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const headerRunId = request.headers.get("x-chat-run-id") ?? undefined;
  const query = streamQuerySchema.safeParse(params);
  const binding = resolveStreamBinding({
    activeRunId: row.activeRunId,
    activeTurnId: row.activeTurnId,
    requestedRunId: (query.success ? query.data.runId : undefined) ?? headerRunId,
    requestedTurnId: query.success ? query.data.turnId : undefined,
    startIndex: query.success ? query.data.startIndex : 0,
  });

  if (binding.kind === "idle") {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  if (binding.kind === "reset") {
    return new Response(null, {
      status: 205,
      headers: {
        "cache-control": "no-store",
        "x-chat-stream": "reset",
        "x-chat-active-run-id": binding.activeRunId,
      },
    });
  }
  return createUIMessageStreamResponse({
    stream: turnUIStream({ runId: binding.runId, turnId: binding.turnId, uiStartIndex: binding.uiStartIndex }),
    headers: { "x-workflow-run-id": binding.runId, "x-chat-id": row.id, "cache-control": "no-store" },
  });
});
