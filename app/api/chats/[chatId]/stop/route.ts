import { after } from "next/server";
import { getRun } from "workflow/api";

import { loadOwnedChat, saveFromStream } from "@/lib/agent/chat-routes";
import { getChat, releaseTurn, requestStop } from "@/lib/agent/chat-store";
import { chatRoute } from "@/lib/agent/route-handler";
import { stopHook, stopTokenFor } from "@/workflows/hooks";

// POST /api/chats/[chatId]/stop: stop the running turn.
//
// 1. Mark stop_requested_at (a turn whose first step has not run yet sees it).
// 2. Resume the run's stop hook: the workflow aborts the model call, persists
//    the partial message with metadata.stopped and releases the lock itself.
// 3. Fallback after 15 s: if that turn still holds the lock, cancel the run,
//    rebuild the partial message from its stream and release the lock here.
// → 202 { stopping: true, turnId } or 200 { stopping: false } when idle.

const CANCEL_FALLBACK_MS = 15_000;

export const POST = chatRoute(async ({ chatId, user }) => {
  const row = await loadOwnedChat(chatId, user);
  const pending = await requestStop(row.id);
  if (!pending) return Response.json({ stopping: false });

  try {
    await stopHook.resume(stopTokenFor(pending.turnId), { reason: "advisor" });
  } catch {
    // The hook is not registered yet (or the run already ended); the flag and
    // the fallback below cover both.
  }

  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, CANCEL_FALLBACK_MS));
    const current = await getChat(row.id);
    if (!current || current.activeTurnId !== pending.turnId) return;
    const runId = current.activeRunId ?? pending.runId;
    if (runId) {
      await getRun(runId)
        .cancel({ cancelReason: "Stopped by the advisor" })
        .catch((error: unknown) => console.error(`[chat ${row.id}] cancel failed`, error));
      await saveFromStream(row.id, pending.turnId, runId, { stopped: true });
    }
    await releaseTurn(row.id, pending.turnId, { status: "idle" });
  });

  return Response.json({ stopping: true, turnId: pending.turnId }, { status: 202 });
});
