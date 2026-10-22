import "server-only";

import { getRun } from "workflow/api";
import { z } from "zod";

import type { AuthUser } from "@/lib/auth/server";
import type { AppUIMessage, ChatSnapshot } from "@/lib/contracts";

import {
  clearPendingSave,
  getChat,
  getTurn,
  isOrphanLock,
  releaseTurn,
  savePendingMessage,
  saveTurnMessage,
  toChatSnapshot,
  type ChatRow,
} from "./chat-store";
import { finalizeTurnMessage, hasContent } from "./messages";
import { assistantMessageIdFor } from "./stream";
import { readTurnMessage } from "./turn-stream";
import { readRunState, type RunState } from "./turn-state";

// What the /api/chats routes share: input schemas, the ownership check, the
// error shape ({ error: "<code>:chat", message }) and lazy healing.

export class ChatRouteError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatRouteError";
  }
}

export function chatErrorResponse(error: ChatRouteError): Response {
  return Response.json({ error: error.code, message: error.message }, { status: error.status });
}

export const chatIdSchema = z.uuid();

export const userMessageSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.literal("user"),
  parts: z
    .array(z.object({ type: z.literal("text"), text: z.string().min(1).max(8_000) }))
    .min(1)
    .max(10),
  metadata: z
    .object({ hidden: z.boolean().optional(), kind: z.enum(["seed", "turn"]).optional() })
    .optional(),
});

export const promptBodySchema = z.object({
  message: userMessageSchema,
  turnId: z.uuid(),
});

/**
 * The listener's query. `runId` / `turnId` bind a reconnect to the run the
 * client was reading (the `x-chat-run-id` header does the same, because
 * WorkflowChatTransport appends `?startIndex=` to a bare URL itself).
 */
export const streamQuerySchema = z.object({
  startIndex: z.coerce.number().int().min(0).default(0),
  runId: z.string().min(1).max(200).optional(),
  turnId: z.string().min(1).max(200).optional(),
});

/**
 * The chat, if the user may see it. A foreign chat and a missing chat give
 * the same not_found:chat, so ids cannot be probed.
 */
export async function loadOwnedChat(rawChatId: string, user: AuthUser): Promise<ChatRow> {
  const parsed = chatIdSchema.safeParse(rawChatId);
  if (!parsed.success) throw new ChatRouteError("not_found:chat", 404, "This chat does not exist.");
  const row = await getChat(parsed.data);
  if (!row || row.ownerId !== user.userId) throw new ChatRouteError("not_found:chat", 404, "This chat does not exist.");
  return row;
}

/** Stream retention is one day on Hobby; a pending save older than this cannot be rebuilt. */
export const PENDING_SAVE_TTL_MS = 23 * 60 * 60_000;
/** A stop that has not ended the run after this long is cancelled again by the next read. */
export const STOP_STALE_MS = 45_000;

const FAILED_REPLY = "The last reply did not finish. Send it again to retry.";

export function runState(runId: string): Promise<RunState> {
  return readRunState(() => getRun(runId).status);
}

/**
 * Lazy healing, run on GET and POST instead of a boot reset. Every write is
 * conditional on the stale turn id (or the pending run id), so a turn that is
 * genuinely alive is never touched.
 *
 * The lock:
 *  - no run id, and the turn record says start() failed: released now;
 *  - no run id for more than 60 s (a crash between lock and start()): released;
 *  - a run confirmed over (completed, failed, cancelled) or missing:
 *    reconciled (the message rebuilt from the stream if the workflow did not
 *    save it), then released;
 *  - a run whose status cannot be read: left alone, tried again next read;
 *  - a live run with a stop requested long ago: cancelled again.
 * A pending save (the workflow could not save its reply) is rebuilt from the
 * run's stream and cleared.
 */
export async function healChat(row: ChatRow): Promise<ChatRow> {
  let current = row;
  if (current.activeTurnId) current = await healLock(current);
  if (current.pendingRunId) current = await healPending(current);
  return current;
}

async function healLock(row: ChatRow): Promise<ChatRow> {
  const turnId = row.activeTurnId;
  if (!turnId) return row;

  const runId = row.activeRunId;
  if (!runId) {
    const startFailed = (await getTurn(turnId))?.status === "failed";
    if (!startFailed && !isOrphanLock(row)) return row;
    await releaseTurn(row.id, turnId, { status: "failed", lastError: "The reply could not start. Send it again." });
    return (await getChat(row.id)) ?? row;
  }

  const state = await runState(runId);
  if (state.kind === "unknown") {
    console.warn(`[chat ${row.id}] run ${runId} status unavailable; lock kept`, state.error);
    return row;
  }
  if (state.kind === "live") {
    if (row.stopRequestedAt && Date.now() - row.stopRequestedAt.getTime() > STOP_STALE_MS) {
      await getRun(runId)
        .cancel({ cancelReason: "Stopped by the advisor" })
        .catch((error: unknown) => console.error(`[chat ${row.id}] cancel retry failed`, error));
    }
    return row;
  }
  await reconcileEndedTurn(row, turnId, runId, state);
  return (await getChat(row.id)) ?? row;
}

/**
 * Finishes a turn whose run is confirmed over or missing: saves the reply
 * from the stream if the workflow did not, then releases the lock. A reply
 * that could not be read is recorded as a pending save in the same statement
 * that releases the lock, so it is never lost.
 */
export async function reconcileEndedTurn(
  row: ChatRow,
  turnId: string,
  runId: string,
  state: Extract<RunState, { kind: "terminal" } | { kind: "missing" }>,
): Promise<boolean> {
  const failed = state.kind === "missing" || state.status === "failed";
  const stopped = state.kind === "terminal" && (state.status === "cancelled" || row.stopRequestedAt !== null);
  const alreadySaved = row.messages.some((m) => m.id === assistantMessageIdFor(turnId));
  const saved = alreadySaved || state.kind === "missing" ? "saved" : await saveFromStream(row.id, turnId, runId, { stopped });
  return releaseTurn(row.id, turnId, {
    status: failed ? "failed" : "idle",
    lastError: failed ? FAILED_REPLY : undefined,
    outcome: failed ? "failed" : stopped ? "stopped" : "completed",
    ...(saved === "error" ? { pendingRunId: runId } : {}),
  });
}

async function healPending(row: ChatRow): Promise<ChatRow> {
  const runId = row.pendingRunId;
  const turnId = row.pendingTurnId;
  if (!runId) return row;
  const done = async () => {
    await clearPendingSave(row.id, runId);
    return (await getChat(row.id)) ?? row;
  };
  if (!turnId || row.messages.some((m) => m.id === assistantMessageIdFor(turnId))) return done();
  if (row.pendingSince && Date.now() - row.pendingSince.getTime() > PENDING_SAVE_TTL_MS) {
    console.error(`[chat ${row.id}] pending reply of turn ${turnId} expired with its stream`);
    return done();
  }
  // The run must be over before its stream is read to the end.
  const state = await runState(runId);
  if (state.kind === "unknown" || state.kind === "live") return row;
  if (state.kind === "missing") return done();

  const stopped = (await getTurn(turnId))?.status === "stopped";
  const read = await readStreamedMessage(runId, turnId, { stopped });
  if (read.kind === "error") return row; // Try again on the next read.
  if (read.kind === "empty") return done();
  await savePendingMessage(row.id, runId, read.message);
  return (await getChat(row.id)) ?? row;
}

/**
 * The healed snapshot a server component passes to <ChatDock initial>.
 * @throws ChatRouteError not_found:chat for a missing or foreign chat.
 */
export async function loadChatSnapshot(chatId: string, user: AuthUser): Promise<ChatSnapshot> {
  return toChatSnapshot(await healChat(await loadOwnedChat(chatId, user)));
}

type StreamedMessage = { kind: "message"; message: AppUIMessage } | { kind: "empty" } | { kind: "error" };

async function readStreamedMessage(runId: string, turnId: string, { stopped }: { stopped: boolean }): Promise<StreamedMessage> {
  try {
    // A cancelled run may never close its stream; stop reading when it goes quiet.
    const streamed = await readTurnMessage({ runId, turnId, idleMs: 2_000 });
    if (!streamed) return { kind: "empty" };
    const message = finalizeTurnMessage(streamed, {
      turnId,
      kind: "turn",
      createdAt: new Date().toISOString(),
      ...(stopped ? { stopped: true } : {}),
    });
    return hasContent(message) ? { kind: "message", message } : { kind: "empty" };
  } catch (error) {
    console.error(`[chat] could not read turn ${turnId} from run ${runId}`, error);
    return { kind: "error" };
  }
}

/**
 * Rebuilds and saves a turn's assistant message from its run stream, while
 * the turn holds the lock.
 * @returns "saved", "empty" (nothing to save) or "error" (the read or the write failed).
 */
export async function saveFromStream(
  chatId: string,
  turnId: string,
  runId: string,
  { stopped }: { stopped: boolean },
): Promise<"saved" | "empty" | "error"> {
  const read = await readStreamedMessage(runId, turnId, { stopped });
  if (read.kind !== "message") return read.kind;
  try {
    await saveTurnMessage(chatId, turnId, read.message);
    return "saved";
  } catch (error) {
    console.error(`[chat ${chatId}] could not save turn ${turnId}`, error);
    return "error";
  }
}
