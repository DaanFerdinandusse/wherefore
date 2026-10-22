import { toUIMessageChunk, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { getToolName, isToolUIPart, type ToolSet, type UIMessageChunk } from "ai";

import type { AppUIMessage, ChatMessageMetadata } from "@/lib/contracts";

// The one durable stream a chat turn writes (one Workflow run = one turn =
// one stream), and the transform that turns it into UI message chunks.
//
// Spike finding (item 1): WorkflowAgent awaits a tool's execute and does not
// iterate an async generator, and @ai-sdk/workflow's own
// createModelCallToUIChunkTransform drops every part type it does not know
// (data-* parts included). So the turn writes two extra part types next to
// the agent's ModelCallStreamPart and this module's transform maps them:
//
//   tool-output-preliminary -> tool-output-available { preliminary: true }
//     A tool step yields phases; the tool part itself renders them (PLAN 6.4)
//     and the final tool-result replaces them. Same stream, same cursor.
//   data-*                   -> passed through as a UI data part.
//   turn-marker              -> never reaches the client; persistTurn reads
//     the run's own stream up to its marker to save exactly what was shown.
//   turn-error               -> an `error` chunk naming the problem.
//
// Pure: no server imports, so the routes, the steps and the tests share it.

export type ToolPreliminaryPart = {
  type: "tool-output-preliminary";
  toolCallId: string;
  output: unknown;
};

export type TurnMarkerPart = { type: "turn-marker"; id: string };

export type TurnErrorPart = { type: "turn-error"; errorText: string };

export type DataStreamPart = { type: `data-${string}`; id?: string; data: unknown; transient?: boolean };

export type ChatStreamPart =
  | ModelCallStreamPart<ToolSet>
  | ToolPreliminaryPart
  | TurnMarkerPart
  | TurnErrorPart
  | DataStreamPart;

/** The assistant message of a turn has a deterministic id, so live, resumed and saved copies agree. */
export function assistantMessageIdFor(turnId: string): string {
  return `a-${turnId}`;
}

function isChatOwnPart(part: ChatStreamPart): part is ToolPreliminaryPart | TurnMarkerPart | TurnErrorPart | DataStreamPart {
  return (
    part.type === "tool-output-preliminary" ||
    part.type === "turn-marker" ||
    part.type === "turn-error" ||
    part.type.startsWith("data-")
  );
}

/** Maps one stored part to its UI chunk, or undefined when it has none. */
export function chatPartToUIChunk(part: ChatStreamPart): UIMessageChunk | undefined {
  if (!isChatOwnPart(part)) return toUIMessageChunk(part);
  switch (part.type) {
    case "tool-output-preliminary":
      return { type: "tool-output-available", toolCallId: part.toolCallId, output: part.output, preliminary: true };
    case "turn-marker":
      return undefined;
    case "turn-error":
      return { type: "error", errorText: part.errorText };
    default:
      return {
        type: part.type,
        ...(part.id !== undefined ? { id: part.id } : {}),
        data: part.data,
        ...(part.transient ? { transient: true } : {}),
      } as UIMessageChunk;
  }
}

/**
 * A saved assistant message as a UI chunk stream, for a prompt whose turnId
 * already finished: the client gets the recorded answer through the same
 * transport, and no run starts. Without a message (nothing was saved) it is
 * a bare start and finish; `errorText` adds the turn's error before finish.
 */
export function messageToUIChunks(
  message: AppUIMessage | undefined,
  { messageId, metadata, errorText }: { messageId: string; metadata?: ChatMessageMetadata; errorText?: string },
): UIMessageChunk[] {
  const chunks: UIMessageChunk[] = [
    { type: "start", messageId, ...(metadata ? { messageMetadata: { ...message?.metadata, ...metadata } } : {}) },
    { type: "start-step" },
  ];
  let steps = 0;
  let n = 0;
  for (const part of message?.parts ?? []) {
    const id = `saved-${n++}`;
    if (part.type === "step-start") {
      if (steps++ > 0) chunks.push({ type: "finish-step" }, { type: "start-step" });
      continue;
    }
    if (part.type === "text") {
      const meta = part.providerMetadata ? { providerMetadata: part.providerMetadata } : {};
      chunks.push({ type: "text-start", id, ...meta }, { type: "text-delta", id, delta: part.text }, { type: "text-end", id, ...meta });
      continue;
    }
    if (part.type === "reasoning") {
      const meta = part.providerMetadata ? { providerMetadata: part.providerMetadata } : {};
      chunks.push(
        { type: "reasoning-start", id, ...meta },
        { type: "reasoning-delta", id, delta: part.text },
        { type: "reasoning-end", id, ...meta },
      );
      continue;
    }
    if (isToolUIPart(part)) {
      const toolName = getToolName(part);
      chunks.push({ type: "tool-input-available", toolCallId: part.toolCallId, toolName, input: part.input });
      if (part.state === "output-available") {
        chunks.push({ type: "tool-output-available", toolCallId: part.toolCallId, output: part.output });
      } else if (part.state === "output-error") {
        chunks.push({ type: "tool-output-error", toolCallId: part.toolCallId, errorText: part.errorText });
      } else if (part.state === "output-denied") {
        chunks.push({ type: "tool-output-denied", toolCallId: part.toolCallId });
      }
      continue;
    }
    if (part.type.startsWith("data-") && "data" in part) {
      chunks.push({ type: part.type, ...("id" in part && part.id ? { id: part.id } : {}), data: part.data } as UIMessageChunk);
    }
  }
  if (errorText) chunks.push({ type: "error", errorText });
  chunks.push({ type: "finish-step" }, { type: "finish" });
  return chunks;
}

/**
 * Stored parts to UI chunks, with the start/step/finish frame around them.
 *
 * Resume: replay the source from index 0 and pass the client's UI chunk
 * count as `uiStartIndex`; the frame and every mapped chunk count, exactly
 * like @ai-sdk/workflow's transform, so the indexes match the transport's.
 *
 * `untilMarker` ends the output at that turn-marker instead of at the end of
 * the source (persistTurn reads a stream that is still open).
 */
export function createChatUIChunkTransform({
  uiStartIndex = 0,
  messageId,
  metadata,
  untilMarker,
}: {
  uiStartIndex?: number;
  messageId?: string;
  metadata?: ChatMessageMetadata;
  untilMarker?: string;
} = {}): TransformStream<ChatStreamPart, UIMessageChunk> {
  if (!Number.isSafeInteger(uiStartIndex) || uiStartIndex < 0) {
    throw new RangeError("uiStartIndex must be a non-negative safe integer");
  }
  let index = 0;
  let ended = false;
  const enqueue = (controller: TransformStreamDefaultController<UIMessageChunk>, chunk: UIMessageChunk) => {
    if (index++ >= uiStartIndex) controller.enqueue(chunk);
  };
  const finish = (controller: TransformStreamDefaultController<UIMessageChunk>) => {
    if (ended) return;
    ended = true;
    enqueue(controller, { type: "finish-step" });
    enqueue(controller, { type: "finish" });
  };

  return new TransformStream<ChatStreamPart, UIMessageChunk>({
    start(controller) {
      enqueue(controller, {
        type: "start",
        ...(messageId ? { messageId } : {}),
        ...(metadata ? { messageMetadata: metadata } : {}),
      });
      enqueue(controller, { type: "start-step" });
    },
    transform(part, controller) {
      if (ended) return;
      if (untilMarker && part.type === "turn-marker" && part.id === untilMarker) {
        finish(controller);
        controller.terminate();
        return;
      }
      const chunk = chatPartToUIChunk(part);
      if (chunk) enqueue(controller, chunk);
    },
    flush(controller) {
      finish(controller);
    },
  });
}
