import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { after } from "next/server";
import { start } from "workflow/api";

import { ChatRouteError, healChat, loadOwnedChat, promptBodySchema } from "@/lib/agent/chat-routes";
import {
  getChat,
  getTurn,
  markTurnFailed,
  releaseTurn,
  setActiveRun,
  takeTurnLock,
  type ChatTurnRow,
} from "@/lib/agent/chat-store";
import { settleSeedStatus } from "@/lib/agent/opening-data";
import { chatRoute } from "@/lib/agent/route-handler";
import { assistantMessageIdFor, messageToUIChunks } from "@/lib/agent/stream";
import { resolveDuplicateTurn } from "@/lib/agent/turn-state";
import { turnUIStream } from "@/lib/agent/turn-stream";
import type { AppUIMessage } from "@/lib/contracts";
import { chatTurn } from "@/workflows/chat-turn";

// POST /api/chats/[chatId]/messages: send one user message, start the turn,
// stream it. Body { message: UIMessage (the new user message only), turnId }.
//
// The turn lock is a conditional UPDATE on chats.active_turn_id that also
// records the turn in chat_turns (chat-store.takeTurnLock):
//   - lock taken: the message is appended (same statement), start() runs,
//     the run id is stored, the run is streamed;
//   - turnId already recorded and still holding the lock (a double submit or
//     a retried request): stream that run, start nothing;
//   - turnId already recorded and finished: stream the recorded outcome (the
//     saved answer), start nothing. Header x-chat-turn: replay;
//   - lock held by another turn: 409 conflict:chat;
//   - the message was already answered: 400 bad_request:chat.
//
// The handoff (lock, start, run id) runs as its own promise registered with
// after(), so a client that disconnects mid-handoff cannot leave a locked
// chat without a run: the response only reads the stream once the handoff
// is done. Fire and forget: closing the request does not stop the run.

const RUN_ID_WAIT_MS = 5_000;
const SET_RUN_ATTEMPTS = 4;

const START_FAILED = "The reply could not start. Send it again.";

function streamResponse(chatId: string, runId: string, turnId: string): Response {
  return createUIMessageStreamResponse({
    stream: turnUIStream({ runId, turnId }),
    headers: { "x-workflow-run-id": runId, "x-chat-id": chatId, "cache-control": "no-store" },
  });
}

/** A finished turn's recorded outcome, through the same UI stream protocol. */
function outcomeResponse(chatId: string, turn: ChatTurnRow, messages: AppUIMessage[]): Response {
  const messageId = assistantMessageIdFor(turn.turnId);
  const chunks = messageToUIChunks(
    messages.find((m) => m.id === messageId),
    {
      messageId,
      metadata: { turnId: turn.turnId, kind: "turn" },
      errorText: turn.status === "failed" ? (turn.error ?? "The last reply failed.") : undefined,
    },
  );
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return createUIMessageStreamResponse({
    stream,
    headers: {
      // The transport requires a run id; the turn's own run, never a new one.
      "x-workflow-run-id": turn.runId ?? "none",
      "x-chat-id": chatId,
      "x-chat-turn": "replay",
      "x-chat-turn-status": turn.status,
      "cache-control": "no-store",
    },
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** The first request holds the lock but may not have stored its run id yet. */
async function waitForRunId(chatId: string, turnId: string): Promise<string | undefined> {
  const deadline = Date.now() + RUN_ID_WAIT_MS;
  while (Date.now() < deadline) {
    const row = await getChat(chatId);
    if (!row || row.activeTurnId !== turnId) return undefined;
    if (row.activeRunId) return row.activeRunId;
    await sleep(250);
  }
  return undefined;
}

type Handoff = { kind: "started"; runId: string } | { kind: "not_locked" } | { kind: "start_failed" };

/**
 * Lock, start() and run registration, in that order, as one promise that
 * does not depend on the request. A failed start() is recorded on the turn
 * first (so a GET heals the lock at once even if the release below fails),
 * then the lock is released.
 */
async function handOff(chatId: string, turnId: string, message: AppUIMessage): Promise<Handoff> {
  if (!(await takeTurnLock(chatId, turnId, message))) return { kind: "not_locked" };

  let runId: string;
  try {
    runId = (await start(chatTurn, [{ chatId, turnId }])).runId;
  } catch (error) {
    console.error(`[chat ${chatId}] start failed`, error);
    await markTurnFailed(chatId, turnId, START_FAILED).catch((e: unknown) =>
      console.error(`[chat ${chatId}] could not record the failed start`, e),
    );
    await releaseTurn(chatId, turnId, { status: "failed", lastError: START_FAILED }).catch((e: unknown) =>
      console.error(`[chat ${chatId}] could not release after a failed start`, e),
    );
    return { kind: "start_failed" };
  }

  // The run is live; its id must land, or a heal would take it for an orphan.
  for (let attempt = 1; ; attempt++) {
    try {
      await setActiveRun(chatId, turnId, runId);
      break;
    } catch (error) {
      if (attempt >= SET_RUN_ATTEMPTS) {
        console.error(`[chat ${chatId}] could not store run ${runId}`, error);
        break;
      }
      await sleep(200 * attempt);
    }
  }
  return { kind: "started", runId };
}

/** A prompt whose turnId is already recorded: never a second run. */
async function duplicateResponse(chatId: string, turn: ChatTurnRow): Promise<Response> {
  const chat = await getChat(chatId);
  if (!chat) throw new ChatRouteError("not_found:chat", 404, "This chat does not exist.");
  const decision = resolveDuplicateTurn({ chatId, turnId: turn.turnId, turn, chat });
  switch (decision.kind) {
    case "foreign":
      throw new ChatRouteError("bad_request:chat", 400, "That message belongs to another chat. Reload the page.");
    case "stream":
      return streamResponse(chatId, decision.runId, turn.turnId);
    case "wait": {
      const runId = await waitForRunId(chatId, turn.turnId);
      if (runId) return streamResponse(chatId, runId, turn.turnId);
      throw new ChatRouteError("conflict:chat", 409, "A reply is still starting. Wait a moment and reload.");
    }
    case "outcome":
      return outcomeResponse(chatId, (await getTurn(turn.turnId)) ?? turn, chat.messages);
  }
}

export const POST = chatRoute(async ({ request, chatId, user }) => {
  const parsed = promptBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ChatRouteError("bad_request:chat", 400, "The message could not be read. Reload the page and send it again.");
  }
  const { turnId } = parsed.data;
  const row = await healChat(await loadOwnedChat(chatId, user));

  // v3: no seed turn. A trip waits for the advisor's brief, so the hidden
  // "Set up the trip" message starts nothing; the seed status is settled.
  if (parsed.data.message.metadata?.kind === "seed") {
    await settleSeedStatus(row.tripId);
    return new Response(null, { status: 204, headers: { "x-chat-turn": "seed-skipped" } });
  }

  const recorded = await getTurn(turnId);
  if (recorded) return duplicateResponse(row.id, recorded);

  const message: AppUIMessage = {
    ...parsed.data.message,
    metadata: { ...parsed.data.message.metadata, turnId, createdAt: new Date().toISOString() },
  };

  const handoff = handOff(row.id, turnId, message);
  after(handoff.catch((error: unknown) => console.error(`[chat ${row.id}] handoff failed`, error)));
  let result: Handoff;
  try {
    result = await handoff;
  } catch (error) {
    // A concurrent identical submit can lose the chat_turns insert race.
    const raced = await getTurn(turnId);
    if (raced) return duplicateResponse(row.id, raced);
    throw error;
  }

  if (result.kind === "started") return streamResponse(row.id, result.runId, turnId);
  if (result.kind === "start_failed") throw new ChatRouteError("unavailable:chat", 503, START_FAILED);

  // Not locked: tell apart a duplicate, a busy chat and an answered message.
  const raced = await getTurn(turnId);
  if (raced) return duplicateResponse(row.id, raced);
  const current = await getChat(row.id);
  if (current?.activeTurnId) {
    throw new ChatRouteError("conflict:chat", 409, "A reply is still running. Wait for it to finish or stop it first.");
  }
  throw new ChatRouteError("bad_request:chat", 400, "That message was already answered. Send a new one instead.");
});
