"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@ai-sdk/workflow/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import type { AppUIMessage, ChatSnapshot } from "@/lib/contracts";

// The dock's chat state: useChat over WorkflowChatTransport, plus the server
// snapshot (status, last error) that useChat does not know about.
//
// How a tab stays attached (PLAN 6.4):
//   - mount: resume when the snapshot says a run is active;
//   - visibilitychange to visible, and a light poll while idle: re-read the
//     snapshot; if a run is active (another tab started it, or our stream
//     dropped) re-sync the transcript to the server's and resume from 0;
//   - when a stream ends: re-read the snapshot so the transcript matches what
//     was persisted.
// Resuming always replays the turn from UI chunk 0 into a transcript that
// does not contain the in-flight assistant message, so text never doubles.
//
// Reconnect binding: every reconnect names the run this tab is reading
// (header x-chat-run-id), so its chunk cursor is never applied to another
// run. When the chat has moved on (another tab started a new turn) the
// listener answers 205 reset; that ends the stream like an idle 204, and the
// end-of-stream refresh re-syncs the transcript and attaches to the new run
// from chunk 0.

const IDLE_POLL_MS = 4_000;
const STOP_GIVE_UP_MS = 20_000;

const snapshotSchema = z.object({
  chat: z.object({
    id: z.string(),
    tripId: z.string(),
    status: z.enum(["idle", "running", "failed"]),
    activeRunId: z.string().optional(),
    activeTurnId: z.string().optional(),
    lastError: z.string().optional(),
    messages: z.array(
      z.looseObject({ id: z.string(), role: z.enum(["system", "user", "assistant"]), parts: z.array(z.unknown()) }),
    ),
  }),
});

type ServerChat = ChatSnapshot["chat"];

const RUN_HEADER = "x-chat-run-id";

/**
 * The run id in the transport's default reconnect URL
 * (`<api>/<runId>/stream`, set when a prompt stream dropped mid-turn), or
 * undefined when it names the chat instead (a resume on mount or refresh).
 */
export function runIdFromReconnectApi(api: string, chatId: string): string | undefined {
  const match = /\/messages\/([^/?]+)\/stream/.exec(api);
  const id = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return id && id !== chatId && id !== "none" && id !== "idle" ? id : undefined;
}

/**
 * Wraps fetch for the transport:
 *   - remembers the run a prompt response streams (x-workflow-run-id);
 *   - a 204 (idle) or 205 (reset: the chat moved to another run) from the
 *     listener becomes a bare finish, so the transport ends cleanly and the
 *     end-of-stream refresh re-reads the transcript.
 */
function sessionFetch(onRun: (runId: string | undefined) => void): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    if ((init?.method ?? "GET") === "POST" && response.ok) {
      const runId = response.headers.get("x-workflow-run-id") ?? undefined;
      onRun(runId && runId !== "none" ? runId : undefined);
    }
    if (response.status !== 204 && response.status !== 205) return response;
    if (response.status === 205) onRun(undefined);
    return new Response('data: {"type":"finish"}\n\n', {
      status: 200,
      headers: { "content-type": "text/event-stream", "x-workflow-run-id": "idle" },
    });
  };
}

/**
 * The chat's transport, plus `bindRun` to say which run this tab reads. The
 * binding lives in the closure: set by a prompt response, by a refresh that
 * resumes, cleared by a reset; read by every reconnect.
 */
function createChatTransport(chatId: string, initialRunId: string | undefined) {
  let readingRunId = initialRunId;
  const bindRun = (runId: string | undefined) => {
    readingRunId = runId;
  };
  const transport = new WorkflowChatTransport<AppUIMessage>({
    api: `/api/chats/${chatId}/messages`,
    fetch: sessionFetch(bindRun),
    maxConsecutiveErrors: 5,
    // Only the new message goes up; the server holds the history. The
    // turn id is minted per send and is the server's idempotency key.
    prepareSendMessagesRequest: ({ messages, api }) => ({
      api,
      body: { message: messages.at(-1), turnId: crypto.randomUUID() },
    }),
    // The transport appends ?startIndex=<chunks received> itself, so the
    // run binding travels as a header.
    prepareReconnectToStreamRequest: ({ api }) => {
      const runId = runIdFromReconnectApi(api, chatId) ?? readingRunId;
      return { api: `/api/chats/${chatId}/stream`, ...(runId ? { headers: { [RUN_HEADER]: runId } } : {}) };
    },
  });
  return { transport, bindRun };
}

export function useChatSession({ chatId, initial }: { chatId: string; initial: ChatSnapshot }) {
  const [server, setServer] = useState<ServerChat>(initial.chat);
  const [stopping, setStopping] = useState(false);
  const [initialRunId] = useState(initial.chat.activeRunId);
  const { transport, bindRun } = useMemo(() => createChatTransport(chatId, initialRunId), [chatId, initialRunId]);

  const chat = useChat<AppUIMessage>({
    id: chatId,
    messages: initial.chat.messages,
    resume: Boolean(initial.chat.activeRunId),
    transport,
  });
  const { status, setMessages, resumeStream } = chat;
  const busy = status === "submitted" || status === "streaming";
  const busyRef = useRef(busy);
  // Bumped on every send, so a snapshot read that started before a send is
  // never applied over the optimistic user message.
  const sendSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = sendSeq.current;
    const response = await fetch(`/api/chats/${chatId}`, { cache: "no-store" }).catch(() => undefined);
    if (!response?.ok) return;
    const parsed = snapshotSchema.safeParse(await response.json());
    if (!parsed.success || seq !== sendSeq.current) return;
    const next = parsed.data.chat as ServerChat;
    setServer(next);
    if (next.status !== "running") setStopping(false);
    if (busyRef.current) return;
    // Re-sync to the persisted transcript; if a turn is live, attach to it
    // from chunk 0, bound to that run.
    setMessages(next.messages);
    bindRun(next.activeRunId);
    if (next.status === "running" && next.activeRunId) void resumeStream();
  }, [chatId, setMessages, resumeStream, bindRun]);

  // A stream just ended (finish, stop, or a dropped connection).
  useEffect(() => {
    const wasBusy = busyRef.current;
    busyRef.current = busy;
    if (wasBusy && !busy) void refresh();
  }, [busy, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && !busyRef.current) void refresh();
    }, IDLE_POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
    };
  }, [refresh]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current) return;
      sendSeq.current += 1;
      chat.clearError();
      setStopping(false);
      setServer((s) => ({ ...s, status: "running", lastError: undefined }));
      void chat.sendMessage({ text: trimmed });
    },
    [chat],
  );

  /** Re-runs the last user message: replaces a failed reply, never duplicates the message. */
  const retryLast = useCallback(() => {
    if (busyRef.current) return;
    sendSeq.current += 1;
    chat.clearError();
    setStopping(false);
    setServer((s) => ({ ...s, status: "running", lastError: undefined }));
    void chat.regenerate();
  }, [chat]);

  const stop = useCallback(async () => {
    setStopping(true);
    await fetch(`/api/chats/${chatId}/stop`, { method: "POST" }).catch(() => undefined);
    // The server ends the stream once the partial reply is saved. If it does
    // not within the window, drop the connection and read the saved state.
    setTimeout(() => {
      if (busyRef.current) void chat.stop().then(() => refresh());
    }, STOP_GIVE_UP_MS);
  }, [chat, chatId, refresh]);

  return {
    messages: chat.messages,
    status,
    busy,
    stopping,
    error: chat.error,
    server,
    send,
    retryLast,
    stop,
    refresh,
  };
}

export type ChatSession = ReturnType<typeof useChatSession>;
