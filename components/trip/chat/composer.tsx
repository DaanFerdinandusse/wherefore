"use client";

import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { NextPrompt } from "@/lib/agent/next-prompt";
import { cn } from "@/lib/ui/cn";

// The composer docked at the bottom of the chat column (Paper G1, S1 to S5):
// a white pill with a placeholder and a round button that
// sends (arrow) or, while a turn runs, stops it (square). Enter sends,
// Shift+Enter is a newline. "/" outside a field focuses it, and so does the
// workspace's focus event. While a turn runs the field stays open, so the
// advisor can type the next change; it sends once the turn is over. Suggestions
// show as a row of pills above an empty field: a click puts the pill's longer
// message in the field for the advisor to edit or send. The row and the field
// are siblings, so the parent's flex column spaces them.

export const FOCUS_COMPOSER_EVENT = "wherefore:focus-composer";

type Props = {
  busy: boolean;
  stopping: boolean;
  placeholder: string;
  suggestions?: readonly NextPrompt[];
  onSend: (text: string) => void;
  onStop: () => void;
  className?: string;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function Composer({ busy, stopping, placeholder, suggestions = [], onSend, onStop, className }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const offers = text ? [] : suggestions;

  useEffect(() => {
    const focus = () => ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        focus();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(FOCUS_COMPOSER_EVENT, focus);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(FOCUS_COMPOSER_EVENT, focus);
    };
  }, []);

  const submit = () => {
    if (busy || !text.trim()) return;
    onSend(text);
    setText("");
  };

  const takeOffer = (offer: NextPrompt) => {
    setText(offer.prompt);
    ref.current?.focus();
  };

  return (
    <>
      {offers.length > 0 ? (
        <div data-testid="next-prompts" className="flex flex-wrap justify-center gap-2">
          {offers.map((offer) => (
            <button
              key={offer.label}
              type="button"
              onClick={() => takeOffer(offer)}
              title={offer.prompt}
              data-testid="next-prompt"
              className="rise-in pointer-events-auto rounded-pill bg-surface-raised px-3 py-1.5 text-ui-sm font-medium text-ink shadow-soft transition-colors hover:bg-surface"
            >
              {offer.label}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className={cn(
          "flex items-end gap-2.5 rounded-[31px] border border-ink/6 bg-white/90 py-2 pr-2 pl-5 shadow-composer",
          className,
        )}
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
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-body-lg leading-5.5 text-ink outline-none placeholder:text-text-muted"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            aria-label={stopping ? "Stopping" : "Stop"}
            title={stopping ? "Stopping" : "Stop the reply"}
            data-testid="stop-button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-ink text-white transition-opacity disabled:opacity-60"
          >
            <Square aria-hidden className="size-3.5 fill-current" strokeWidth={0} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            title="Send"
            data-testid="send-button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-ink text-white transition-opacity disabled:opacity-85"
          >
            <ArrowUp aria-hidden className="size-4.5" strokeWidth={2.4} />
          </button>
        )}
      </form>
    </>
  );
}
