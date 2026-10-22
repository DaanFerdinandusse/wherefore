import "server-only";

import { getRun } from "workflow/api";
import { z } from "zod";

import type { AuthUser } from "@/lib/auth/server";
import type { AppUIMessage, ChatSnapshot } from "@/lib/contracts";

import { getChat, isOrphanLock, releaseTurn, saveTurnMessage, toChatSnapshot, type ChatRow } from "./chat-store";
import { finalizeTurnMessage, hasContent } from "./messages";
import { assistantMessageIdFor } from "./stream";
import { readTurnMessage } from "./turn-stream";

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

export const streamQuerySchema = z.object({
  startIndex: z.coerce.number().int().min(0).default(0),
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

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

async function runStatus(runId: string): Promise<string> {
  try {
    return await getRun(runId).status;
  } catch {
    // An unknown run (expired, or a different world) cannot finish the turn.
    return "failed";
  }
}

/**
 * Lazy healing, run on GET and POST instead of a boot reset:
 *  - a lock with no run id older than 60 s (crash between lock and start())
 *    is cleared;
 *  - a running chat whose run is completed, failed or cancelled is
 *    reconciled: if the workflow did not save the assistant message, it is
 *    rebuilt from the run's stream, then the lock is released.
 * Every write is conditional on the stale turn id, so a turn that is
 * genuinely alive is never touched.
 */
export async function healChat(row: ChatRow): Promise<ChatRow> {
  const turnId = row.activeTurnId;
  if (!turnId) return row;

  if (isOrphanLock(row)) {
    await releaseTurn(row.id, turnId, { status: "idle" });
    return (await getChat(row.id)) ?? row;
  }

  const runId = row.activeRunId;
  if (!runId) return row;
  const status = await runStatus(runId);
  if (!TERMINAL.has(status)) return row;

  const saved = row.messages.some((m) => m.id === assistantMessageIdFor(turnId));
  if (!saved) await saveFromStream(row.id, turnId, runId, { stopped: status === "cancelled" });
  await releaseTurn(row.id, turnId, {
    status: status === "failed" ? "failed" : "idle",
    lastError: status === "failed" ? "The last reply did not finish. Send it again to retry." : undefined,
  });
  return (await getChat(row.id)) ?? row;
}

/**
 * The healed snapshot a server component passes to <ChatDock initial>.
 * @throws ChatRouteError not_found:chat for a missing or foreign chat.
 */
export async function loadChatSnapshot(chatId: string, user: AuthUser): Promise<ChatSnapshot> {
  return toChatSnapshot(await healChat(await loadOwnedChat(chatId, user)));
}

/** Rebuilds and saves a turn's assistant message from its run stream. */
export async function saveFromStream(
  chatId: string,
  turnId: string,
  runId: string,
  { stopped }: { stopped: boolean },
): Promise<AppUIMessage | undefined> {
  try {
    // A cancelled run may never close its stream; stop reading when it goes quiet.
    const streamed = await readTurnMessage({ runId, turnId, idleMs: 2_000 });
    if (!streamed) return undefined;
    const message = finalizeTurnMessage(streamed, {
      turnId,
      kind: "turn",
      createdAt: new Date().toISOString(),
      ...(stopped ? { stopped: true } : {}),
    });
    if (!hasContent(message)) return undefined;
    await saveTurnMessage(chatId, turnId, message);
    return message;
  } catch (error) {
    console.error(`[chat ${chatId}] could not rebuild turn ${turnId} from its stream`, error);
    return undefined;
  }
}
