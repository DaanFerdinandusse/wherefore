import { WorkflowAgent } from "@ai-sdk/workflow";
import { isLoopFinished, isStepCount, type ModelMessage } from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";

import { getChat, markPendingSave, releaseTurn, saveTurnMessage } from "@/lib/agent/chat-store";
import { trimHistory } from "@/lib/agent/history";
import { finalizeTurnMessage, hasContent, toModelHistory } from "@/lib/agent/messages";
import { buildInstructions } from "@/lib/agent/prompt";
import { assistantMessageIdFor, type ChatStreamPart } from "@/lib/agent/stream";
import { createChatTools } from "@/lib/agent/tools";
import { loadTripContext } from "@/lib/agent/trip-context";
import { readTurnMessage } from "@/lib/agent/turn-stream";
import { agentModelRef, agentProviderOptions } from "@/lib/codex/provider";
import { registryModel } from "@/lib/codex/workflow-model";

import { stopHook, stopTokenFor } from "./hooks";

// One agent turn of a trip chat (PLAN 6.2). Started by the prompt route with
// only ids; everything else is read inside the first step so the run payload
// stays small and replay is deterministic.
//
// Ownership: every write is conditional on chats.active_turn_id = turnId
// (lib/agent/chat-store.ts), so a cancelled or superseded run cannot touch a
// newer turn. persistTurn is the only writer of chats.messages for a turn.
//
// The stream: the agent, the tools (preliminary outputs) and this workflow
// all write to the run's one default stream. It stays open (preventClose)
// until the turn is persisted and the lock released, so a client that sees
// `finish` can reload and find the saved message.

type TurnInput = {
  tripId: string;
  instructions: string;
  messages: ModelMessage[];
  modelRef: string;
  providerOptions: ReturnType<typeof agentProviderOptions>;
};

type TurnOutcome = { status: "completed" | "stopped" | "failed" | "superseded"; error?: string };

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return typeof error === "string" ? error : "Something went wrong running this turn.";
}

async function loadTurnInput(chatId: string, turnId: string): Promise<TurnInput | { skip: "superseded" | "stopped" }> {
  "use step";
  const chat = await getChat(chatId);
  if (!chat || chat.activeTurnId !== turnId) return { skip: "superseded" };
  // A stop that landed before the hook existed.
  if (chat.stopRequestedAt) return { skip: "stopped" };
  const context = await loadTripContext(chat.tripId);
  // Drop this turn's own assistant message if a replay finds one.
  const history = chat.messages.filter((m) => m.id !== assistantMessageIdFor(turnId));
  return {
    tripId: chat.tripId,
    instructions: buildInstructions(context),
    messages: await toModelHistory(history),
    modelRef: agentModelRef(),
    providerOptions: agentProviderOptions(chatId),
  };
}

/**
 * Saves exactly what the client was shown: writes a marker to the run's
 * stream, then folds the stream up to that marker into the assistant message.
 * Idempotent: the message id is deterministic and the save is an upsert.
 *
 * A read or save that fails is not swallowed: the turn gets a pending save
 * record (chats.pending_run_id) while it still holds the lock, and the next
 * GET rebuilds the reply from this run's stream. If even that record cannot
 * be written the step throws, and the catch path keeps the lock so the GET
 * heal path reconciles from the stream instead.
 */
async function persistTurn(args: {
  chatId: string;
  turnId: string;
  runId: string;
  stopped: boolean;
}): Promise<boolean> {
  "use step";
  const markerId = `persist:${args.turnId}`;
  const writer = getWritable<ChatStreamPart>().getWriter();
  try {
    await writer.write({ type: "turn-marker", id: markerId });
  } finally {
    writer.releaseLock();
  }
  try {
    const streamed = await readTurnMessage({ runId: args.runId, turnId: args.turnId, untilMarker: markerId });
    if (!streamed) return false;
    const message = finalizeTurnMessage(streamed, {
      turnId: args.turnId,
      kind: "turn",
      createdAt: new Date().toISOString(),
      ...(args.stopped ? { stopped: true } : {}),
    });
    if (!hasContent(message)) return false;
    // false: the lock moved on (superseded); nothing of ours to keep.
    return await saveTurnMessage(args.chatId, args.turnId, message);
  } catch (error) {
    console.error(`[chat ${args.chatId}] could not save turn ${args.turnId}; recording a pending save`, error);
    await markPendingSave(args.chatId, args.turnId, args.runId);
    return false;
  }
}

/** Releases the lock and finalizes the turn record (stopped when a stop was requested, else completed). */
async function markIdle(chatId: string, turnId: string): Promise<void> {
  "use step";
  await releaseTurn(chatId, turnId, { status: "idle", outcome: "auto" });
}

/**
 * Tells the client the turn failed without releasing the lock: the reply is
 * neither saved nor recorded as pending, so the GET heal path must rebuild it
 * from the stream once the run is over.
 */
async function notifyTurnError(error: string): Promise<void> {
  "use step";
  const writer = getWritable<ChatStreamPart>().getWriter();
  try {
    await writer.write({ type: "turn-error", errorText: error });
  } finally {
    writer.releaseLock();
  }
}

async function markFailed(chatId: string, turnId: string, error: string, notifyStream: boolean): Promise<void> {
  "use step";
  if (notifyStream) {
    const writer = getWritable<ChatStreamPart>().getWriter();
    try {
      await writer.write({ type: "turn-error", errorText: error });
    } finally {
      writer.releaseLock();
    }
  }
  await releaseTurn(chatId, turnId, { status: "failed", lastError: error.slice(0, 500) });
}

async function closeTurnStream(): Promise<void> {
  "use step";
  await getWritable<ChatStreamPart>().close();
}

export async function chatTurn({ chatId, turnId }: { chatId: string; turnId: string }): Promise<TurnOutcome> {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  let outcome: TurnOutcome = { status: "completed" };
  try {
    const input = await loadTurnInput(chatId, turnId);
    if ("skip" in input) {
      if (input.skip === "stopped") await markIdle(chatId, turnId);
      return { status: input.skip };
    }

    const controller = new AbortController();
    let stopped = false;
    const stop = stopHook.create({ token: stopTokenFor(turnId) });
    void stop.then(() => {
      stopped = true;
      controller.abort();
    });

    const agent = new WorkflowAgent({
      // A serializable handle; a string would go to the AI Gateway and a
      // provider object would lose codexFetch (lib/codex/workflow-model.ts).
      model: registryModel(input.modelRef),
      instructions: input.instructions,
      tools: createChatTools({ chatId, tripId: input.tripId, turnId }),
      stopWhen: [isLoopFinished(), isStepCount(12)],
      providerOptions: input.providerOptions,
      prepareStep: ({ messages }) => ({ messages: trimHistory(messages) }),
    });

    let streamError: string | undefined;
    try {
      const result = await agent.stream({
        messages: input.messages,
        writable: getWritable<ChatStreamPart>(),
        abortSignal: controller.signal,
        sendFinish: false,
        preventClose: true,
      });
      if ("error" in result) streamError = errorText(result.error);
    } catch (error) {
      // An abort can reject the agent; anything else is a real failure.
      if (!stopped) throw error;
    }

    // Awaited after the abort settled, so the partial output is complete.
    await persistTurn({ chatId, turnId, runId: workflowRunId, stopped });
    if (streamError && !stopped) {
      await markFailed(chatId, turnId, streamError, false);
      outcome = { status: "failed", error: streamError };
    } else {
      await markIdle(chatId, turnId);
      outcome = { status: stopped ? "stopped" : "completed" };
    }
  } catch (error) {
    const message = errorText(error);
    // Release only once the reply is saved or recorded as pending.
    let kept = true;
    try {
      await persistTurn({ chatId, turnId, runId: workflowRunId, stopped: false });
    } catch {
      kept = false;
    }
    if (kept) await markFailed(chatId, turnId, message, true);
    else await notifyTurnError(message);
    outcome = { status: "failed", error: message };
  } finally {
    await closeTurnStream();
  }
  return outcome;
}
