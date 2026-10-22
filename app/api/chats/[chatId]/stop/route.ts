import { after } from "next/server";
import { getRun } from "workflow/api";

import { loadOwnedChat, reconcileEndedTurn, runState } from "@/lib/agent/chat-routes";
import { getChat, requestStop } from "@/lib/agent/chat-store";
import { chatRoute } from "@/lib/agent/route-handler";
import type { RunState } from "@/lib/agent/turn-state";
import { stopHook, stopTokenFor } from "@/workflows/hooks";

// POST /api/chats/[chatId]/stop: stop the running turn.
//
// 1. Mark stop_requested_at (a turn whose first step has not run yet sees it).
// 2. Resume the run's stop hook: the workflow aborts the model call, persists
//    the partial message with metadata.stopped and releases the lock itself.
// 3. Fallback after 15 s, if that turn still holds the lock, as a confirmed
//    sequence: request cancellation, poll the run status for up to 20 s, and
//    only on a confirmed terminal status rebuild the partial message from the
//    stream and release the lock. Without confirmation the lock stays, with
//    stop_requested_at set; the GET heal path cancels again and finishes it
//    once the run is over.
// → 202 { stopping: true, turnId } or 200 { stopping: false } when idle.

const CANCEL_FALLBACK_MS = 15_000;
const CANCEL_CONFIRM_MS = 20_000;
const CANCEL_POLL_MS = 1_000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls until the run is confirmed over (or missing), or the window closes. */
async function waitForEnd(runId: string): Promise<Extract<RunState, { kind: "terminal" } | { kind: "missing" }> | undefined> {
  const deadline = Date.now() + CANCEL_CONFIRM_MS;
  while (Date.now() < deadline) {
    const state = await runState(runId);
    if (state.kind === "terminal" || state.kind === "missing") return state;
    await sleep(CANCEL_POLL_MS);
  }
  return undefined;
}

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
    await sleep(CANCEL_FALLBACK_MS);
    const current = await getChat(row.id);
    if (!current || current.activeTurnId !== pending.turnId) return;
    const runId = current.activeRunId ?? pending.runId;
    // No run id yet: the orphan-lock heal covers it.
    if (!runId) return;
    await getRun(runId)
      .cancel({ cancelReason: "Stopped by the advisor" })
      .catch((error: unknown) => console.error(`[chat ${row.id}] cancel failed`, error));
    const ended = await waitForEnd(runId);
    if (!ended) {
      console.warn(`[chat ${row.id}] run ${runId} not confirmed over after cancel; the lock stays for the heal path`);
      return;
    }
    const latest = await getChat(row.id);
    if (!latest || latest.activeTurnId !== pending.turnId) return;
    await reconcileEndedTurn(latest, pending.turnId, runId, ended);
  });

  return Response.json({ stopping: true, turnId: pending.turnId }, { status: 202 });
});
