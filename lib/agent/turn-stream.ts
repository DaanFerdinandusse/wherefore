import "server-only";

import { readUIMessageStream } from "ai";
import { getRun } from "workflow/api";

import type { AppUIMessage, ChatMessageMetadata } from "@/lib/contracts";

import { assistantMessageIdFor, createChatUIChunkTransform, type ChatStreamPart } from "./stream";

// Reading a turn's durable stream on the server: the UI response for the
// prompt and listener routes, and the assistant message persistTurn saves.

const RUN_POLL_MS = 3_000;
const RUN_END_GRACE_MS = 1_500;

/** The run's stream as UI chunks, skipping the `uiStartIndex` chunks the client already has. */
export function turnUIStream({
  runId,
  turnId,
  uiStartIndex = 0,
}: {
  runId: string;
  turnId: string;
  uiStartIndex?: number;
}): ReadableStream {
  return endWhenRunEnds(runId, getRun(runId).getReadable<ChatStreamPart>({ startIndex: 0 })).pipeThrough(
    createChatUIChunkTransform({
      uiStartIndex,
      messageId: assistantMessageIdFor(turnId),
      metadata: { turnId, kind: "turn" },
    }),
  );
}

/**
 * Folds a run's stream into the assistant message the client rendered.
 *
 * `untilMarker`: stop at that turn-marker (the stream is still open when
 * persistTurn reads it). `idleMs`: for a run that was cancelled and will
 * never close its stream, give up after this long without a new chunk.
 */
export async function readTurnMessage({
  runId,
  turnId,
  untilMarker,
  idleMs,
}: {
  runId: string;
  turnId: string;
  untilMarker?: string;
  idleMs?: number;
}): Promise<AppUIMessage | undefined> {
  const metadata: ChatMessageMetadata = { turnId, kind: "turn" };
  let source: ReadableStream<ChatStreamPart> = getRun(runId).getReadable<ChatStreamPart>({ startIndex: 0 });
  if (idleMs) source = source.pipeThrough(closeWhenIdle<ChatStreamPart>(idleMs));
  const stream = source.pipeThrough(
    createChatUIChunkTransform({ messageId: assistantMessageIdFor(turnId), metadata, untilMarker }),
  );
  let last: AppUIMessage | undefined;
  for await (const message of readUIMessageStream<AppUIMessage>({ stream, onError: () => {} })) {
    last = message;
  }
  return last;
}

/**
 * A run that dies outside the workflow's own try/finally (cancelled, not
 * registered, crashed) never closes its stream, and a listener would hang.
 * This wrapper polls the run status and ends the stream shortly after the
 * run is terminal; the UI then sees `finish` and rehydrates. Cancelling the
 * wrapper (the client went away) stops the polling and the source read.
 */
function endWhenRunEnds<T>(runId: string, source: ReadableStream<T>): ReadableStream<T> {
  const reader = source.getReader();
  let poll: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const finish = (controller: ReadableStreamDefaultController<T>) => {
    if (closed) return;
    closed = true;
    clearInterval(poll);
    void reader.cancel().catch(() => {});
    try {
      controller.close();
    } catch {
      // Already closed.
    }
  };
  return new ReadableStream<T>({
    start(controller) {
      poll = setInterval(() => {
        void getRun(runId)
          .status.then((status) => {
            if (closed || (status !== "completed" && status !== "failed" && status !== "cancelled")) return;
            clearInterval(poll);
            setTimeout(() => finish(controller), RUN_END_GRACE_MS);
          })
          .catch(() => {});
      }, RUN_POLL_MS);
    },
    async pull(controller) {
      if (closed) return;
      const next = await reader.read().catch(() => undefined);
      if (closed) return;
      if (!next || next.done) finish(controller);
      else controller.enqueue(next.value);
    },
    cancel() {
      closed = true;
      clearInterval(poll);
      return reader.cancel().catch(() => {});
    },
  });
}

function closeWhenIdle<T>(idleMs: number): TransformStream<T, T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new TransformStream<T, T>({
    start(controller) {
      timer = setTimeout(() => controller.terminate(), idleMs);
    },
    transform(chunk, controller) {
      clearTimeout(timer);
      controller.enqueue(chunk);
      timer = setTimeout(() => controller.terminate(), idleMs);
    },
    flush() {
      clearTimeout(timer);
    },
  });
}
