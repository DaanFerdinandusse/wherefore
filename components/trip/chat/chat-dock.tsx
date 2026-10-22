"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { ChatDockProps } from "../contracts";

import { describeChatError } from "./chat-errors";
import { extractChatPlaces, toolPlaceEvents } from "./chat-places";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { useChatSession } from "./use-chat-session";

// The glass chat dock for a trip. Owns the durable chat session; hands
// place hover and click out to the map and the board, and every batch of
// places a tool streams (preliminary and final) to `onPlaces`, so the board
// and the map fill before the model finishes talking. Props: ChatDockProps
// in components/trip/contracts.ts.

export type { ChatDockProps };

export function ChatDock({
  chatId,
  initial,
  onPlaces,
  onPlacesHover,
  onPlaceClick,
  toggle,
  className,
}: ChatDockProps) {
  const session = useChatSession({ chatId, initial });
  const { messages, busy, stopping, error, server, send, retryLast, stop } = session;

  // Each tool output is announced once per change (phase, count, reasons).
  const announced = useRef(new Set<string>());
  const onPlacesRef = useRef(onPlaces);
  useEffect(() => {
    onPlacesRef.current = onPlaces;
  }, [onPlaces]);
  useEffect(() => {
    for (const event of toolPlaceEvents(messages)) {
      if (announced.current.has(event.key)) continue;
      announced.current.add(event.key);
      onPlacesRef.current?.(event.places, { askId: event.askId, toolCallId: event.toolCallId, phase: event.phase });
    }
  }, [messages]);

  const names = useMemo(() => new Map(extractChatPlaces(messages).map((p) => [p.tripPlaceId, p.name])), [messages]);
  const placeName = useCallback((id: string) => names.get(id), [names]);

  const problem =
    describeChatError(error) ??
    (server.status === "failed" && !busy ? describeChatError(server.lastError ?? "The last reply failed.") : undefined);

  // Retry from a tool card re-sends the user message that led to that reply.
  const retryAsk = useCallback(
    (assistantMessageId: string) => {
      const index = messages.findIndex((m) => m.id === assistantMessageId);
      const ask = messages
        .slice(0, index === -1 ? messages.length : index)
        .findLast((m) => m.role === "user");
      // The seed message is hidden and carries kind "seed": re-run it as is.
      if (ask?.metadata?.kind === "seed") {
        if (messages.findLast((m) => m.role === "user")?.id === ask.id) retryLast();
        return;
      }
      const text = ask?.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
      if (text) send(text);
    },
    [messages, send, retryLast],
  );

  return (
    <section
      aria-label="Planning assistant"
      data-testid="chat-dock"
      data-busy={busy ? "true" : "false"}
      className={`glass relative flex min-h-0 flex-col gap-3 rounded-sheet p-3 hairline ${className ?? ""}`}
    >
      {toggle ? <div className="absolute -top-14 left-1/2 -translate-x-1/2">{toggle}</div> : null}
      <header className="flex items-center justify-between px-1">
        <span className="label-caps text-text-2">Assistant</span>
        {busy ? <span className="label-caps text-amber">{stopping ? "Stopping" : "Working"}</span> : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {messages.filter((m) => !m.metadata?.hidden).length === 0 ? (
          <p className="text-text-2">Ask for places, a day plan, or what this client would love.</p>
        ) : (
          <MessageList
            messages={messages}
            streaming={busy}
            onRetryAsk={retryAsk}
            onPlacesHover={onPlacesHover}
            onPlaceClick={onPlaceClick}
            placeName={placeName}
          />
        )}
      </div>

      {problem && !busy ? (
        <div role="alert" data-testid="chat-error" className="flex items-start gap-2 rounded-card bg-surface-raised px-3 py-2 hairline">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" strokeWidth={1.75} />
          <p className="text-ink">
            {problem.problem} <span className="text-text-2">{problem.recovery}</span>
          </p>
          {problem.retry ? (
            <button
              type="button"
              onClick={retryLast}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-ink hairline hover:bg-surface"
            >
              <RotateCcw aria-hidden className="size-3" strokeWidth={1.75} />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      <Composer busy={busy} stopping={stopping} onSend={send} onStop={() => void stop()} />
    </section>
  );
}
