"use client";

import { isToolUIPart } from "ai";

import type { AppUIMessage } from "@/lib/contracts";

import { ToolCard } from "./tool-card";
import { needsThinkingIndicator } from "./chat-activity";
import { StreamingText, ThinkingIndicator, ThinkingSummary } from "./streaming-parts";

// The transcript: user bubbles, assistant text with a streaming cursor, and a
// tool card per tool part, in part order. Readable reasoning summaries are
// expandable. Hidden messages (the
// seed turn's synthetic prompt) are not rendered. Scrolling belongs to the
// dock (chat-dock.tsx), which keeps the list pinned to the bottom.

type Props = {
  messages: AppUIMessage[];
  streaming: boolean;
  onRetryAsk: (assistantMessageId: string) => void;
  onPlacesHover?: (placeId: string | null) => void;
  onPlaceClick?: (placeId: string) => void;
  placeName?: (tripPlaceId: string) => string | undefined;
};


export function MessageList({ messages, streaming, onRetryAsk, onPlacesHover, onPlaceClick, placeName }: Props) {
  const visible = messages.filter((m) => !m.metadata?.hidden);
  const last = visible.at(-1);

  return (
    <ol className="flex flex-col gap-3" data-testid="message-list">
      {visible.map((message) => {
        if (message.role === "user") {
          const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          return (
            <li key={message.id} data-testid="user-message" className="ml-8 self-end rounded-card bg-surface-raised px-3.5 py-2 text-ink hairline">
              {text}
            </li>
          );
        }
        const isLive = streaming && message.id === last?.id;
        const lastTextIndex = message.parts.findLastIndex((p) => p.type === "text");
        return (
          <li key={message.id} data-testid="assistant-message" data-stopped={message.metadata?.stopped ? "true" : "false"} className="flex flex-col gap-2">
            {message.parts.map((part, index) => {
              if (part.type === "reasoning") {
                return <ThinkingSummary key={`${message.id}-${index}`} text={part.text} active={isLive && part.state === "streaming"} />;
              }
              if (part.type === "text") {
                return (
                  <p key={`${message.id}-${index}`} data-testid="assistant-text" className="whitespace-pre-wrap text-ink">
                    <StreamingText text={part.text} active={isLive && index === lastTextIndex && part.state === "streaming"} />
                  </p>
                );
              }
              if (isToolUIPart(part)) {
                return (
                  <ToolCard
                    key={part.toolCallId}
                    part={part}
                    onRetry={!streaming ? () => onRetryAsk(message.id) : undefined}
                    onPlacesHover={onPlacesHover}
                    onPlaceClick={onPlaceClick}
                    placeName={placeName}
                  />
                );
              }
              return null;
            })}
            {message.metadata?.stopped ? <p className="label-caps text-text-2">Stopped</p> : null}
          </li>
        );
      })}
      {needsThinkingIndicator(messages, streaming) ? <li><ThinkingIndicator /></li> : null}
    </ol>
  );
}
