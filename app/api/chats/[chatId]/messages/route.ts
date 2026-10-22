import { createUIMessageStreamResponse } from "ai";
import { start } from "workflow/api";

import { ChatRouteError, healChat, loadOwnedChat, promptBodySchema } from "@/lib/agent/chat-routes";
import { canResend, getChat, releaseTurn, setActiveRun, takeTurnLock } from "@/lib/agent/chat-store";
import { chatRoute } from "@/lib/agent/route-handler";
import { turnUIStream } from "@/lib/agent/turn-stream";
import type { AppUIMessage } from "@/lib/contracts";
import { chatTurn } from "@/workflows/chat-turn";

// POST /api/chats/[chatId]/messages: send one user message, start the turn,
// stream it. Body { message: UIMessage (the new user message only), turnId }.
//
// The turn lock is a conditional UPDATE on chats.active_turn_id:
//   - lock taken: append the message (same statement), start(), store the run
//     id, stream the run;
//   - lock held by the same turnId (a double submit or a retried request):
//     stream that run, start nothing;
//   - lock held by another turn: 409 conflict:chat.
// Fire and forget: closing the request does not stop the run.

const RUN_ID_WAIT_MS = 5_000;

function streamResponse(chatId: string, runId: string, turnId: string): Response {
  return createUIMessageStreamResponse({
    stream: turnUIStream({ runId, turnId }),
    headers: { "x-workflow-run-id": runId, "x-chat-id": chatId, "cache-control": "no-store" },
  });
}

/** The first request holds the lock but may not have stored its run id yet. */
async function waitForRunId(chatId: string, turnId: string): Promise<string | undefined> {
  const deadline = Date.now() + RUN_ID_WAIT_MS;
  while (Date.now() < deadline) {
    const row = await getChat(chatId);
    if (!row || row.activeTurnId !== turnId) return undefined;
    if (row.activeRunId) return row.activeRunId;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return undefined;
}

export const POST = chatRoute(async ({ request, chatId, user }) => {
  const parsed = promptBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ChatRouteError("bad_request:chat", 400, "The message could not be read. Reload the page and send it again.");
  }
  const { turnId } = parsed.data;
  const row = await healChat(await loadOwnedChat(chatId, user));

  const message: AppUIMessage = {
    ...parsed.data.message,
    metadata: { ...parsed.data.message.metadata, turnId, createdAt: new Date().toISOString() },
  };

  if (row.activeTurnId !== turnId && !canResend(row.messages, message.id)) {
    throw new ChatRouteError("bad_request:chat", 400, "That message was already answered. Send a new one instead.");
  }

  if (!(await takeTurnLock(row.id, turnId, message))) {
    const runId = await waitForRunId(row.id, turnId);
    if (runId) return streamResponse(row.id, runId, turnId);
    throw new ChatRouteError("conflict:chat", 409, "A reply is still running. Wait for it to finish or stop it first.");
  }

  let runId: string;
  try {
    const run = await start(chatTurn, [{ chatId: row.id, turnId }]);
    runId = run.runId;
  } catch (error) {
    console.error(`[chat ${row.id}] start failed`, error);
    await releaseTurn(row.id, turnId, { status: "failed", lastError: "The reply could not start. Send it again." });
    throw new ChatRouteError("unavailable:chat", 503, "The reply could not start. Send it again.");
  }
  await setActiveRun(row.id, turnId, runId);
  return streamResponse(row.id, runId, turnId);
});
