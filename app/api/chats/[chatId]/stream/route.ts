import { createUIMessageStreamResponse } from "ai";

import { loadOwnedChat, streamQuerySchema } from "@/lib/agent/chat-routes";
import { chatRoute } from "@/lib/agent/route-handler";
import { turnUIStream } from "@/lib/agent/turn-stream";

// GET /api/chats/[chatId]/stream?startIndex=n: re-attach to the running turn.
// The run is resolved server side from chats.active_run_id, so any tab can
// attach. 204 when the chat is idle. `startIndex` counts UI chunks the client
// already has (WorkflowChatTransport appends it to the URL itself); the run's
// stream is replayed from 0 and that many chunks are skipped.
export const GET = chatRoute(async ({ request, chatId, user }) => {
  const row = await loadOwnedChat(chatId, user);
  if (!row.activeRunId || !row.activeTurnId) {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  const query = streamQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const uiStartIndex = query.success ? query.data.startIndex : 0;
  return createUIMessageStreamResponse({
    stream: turnUIStream({ runId: row.activeRunId, turnId: row.activeTurnId, uiStartIndex }),
    headers: { "x-workflow-run-id": row.activeRunId, "x-chat-id": row.id, "cache-control": "no-store" },
  });
});
