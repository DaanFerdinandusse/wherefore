"use client";

import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// The composer: Enter sends, Shift+Enter is a newline, "/" anywhere outside
// a field focuses it. While a reply runs the send button becomes Stop.

type Props = {
  busy: boolean;
  stopping: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function Composer({ busy, stopping, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    if (busy || !text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <form
      className="flex items-end gap-2 rounded-card bg-surface-raised/80 p-2 hairline"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="chat-composer" className="sr-only">
        Message the agent
      </label>
      <textarea
        id="chat-composer"
        ref={ref}
        data-testid="composer"
        rows={1}
        value={text}
        placeholder="Ask for places, or press / to type"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-ink outline-none placeholder:text-text-2 field-sizing-content"
      />
      {busy ? (
        <button
          type="button"
          onClick={onStop}
          disabled={stopping}
          data-testid="stop-button"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill bg-ink px-3.5 text-surface-raised disabled:opacity-60"
        >
          <Square aria-hidden className="size-3 fill-current" strokeWidth={1.75} />
          {stopping ? "Stopping" : "Stop"}
        </button>
      ) : (
        <button
          type="submit"
          disabled={!text.trim()}
          data-testid="send-button"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill bg-ink px-3.5 text-surface-raised disabled:opacity-40"
        >
          <ArrowUp aria-hidden className="size-3.5" strokeWidth={1.75} />
          Send
        </button>
      )}
    </form>
  );
}
