"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import type { ChatActivity } from "./chat-activity";

/** Stable word keys keep earlier text still as new words arrive. No artificial delay. */
export function StreamingText({ text, active }: { text: string; active: boolean }) {
  const [initialLength] = useState(active ? 0 : text.length);
  return <>{Array.from(text.matchAll(/\s+|\S+/g), (match) => {
    const word = match[0];
    const start = match.index;
    return <span key={start} className={active && start >= initialLength ? "chat-word-reveal" : undefined}>{word}</span>;
  })}{active ? <span aria-hidden data-testid="stream-cursor" className="chat-stream-cursor ml-1 inline-block h-[1em] w-0.5 translate-y-0.5 bg-amber" /> : null}</>;
}

/** Retain the last label for the exit fade; a new phase cancels the pending removal. */
export function ThinkingIndicator({ activity }: { activity: ChatActivity | null }) {
  const [retained, setRetained] = useState(activity);
  const active = activity !== null;
  if (activity && (activity.key !== retained?.key || activity.summary !== retained.summary || activity.kind !== retained.kind)) {
    setRetained(activity);
  }
  useEffect(() => {
    if (active) return;
    const timer = window.setTimeout(() => setRetained(null), 160);
    return () => window.clearTimeout(timer);
  }, [active]);
  const shown = activity ?? retained;
  if (!shown) return null;
  return (
    <li
      className="chat-activity-presence px-1 py-2 text-ui text-text-2"
      data-state={active ? "active" : "exiting"}
      data-testid="agent-activity"
      aria-hidden={!active}
      inert={!active}
    >
      <div role={active ? "status" : undefined} aria-atomic="true" data-testid={active ? shown.kind : undefined} className="flex items-start gap-2.5">
        <span aria-hidden className="mt-2 flex shrink-0 gap-1 text-amber">
          {[0, 1, 2].map((dot) => <span key={dot} className="chat-thinking-dot size-1 rounded-full bg-current" style={{ animationDelay: `${dot * 140}ms` }} />)}
        </span>
        <span className="min-w-0 leading-relaxed wrap-anywhere">{shown.label}</span>
      </div>
    </li>
  );
}

/** Only the provider's readable summary is shown, never encrypted metadata. */
export function ThinkingSummary({ text, active }: { text: string; active: boolean }) {
  const [expanded, setExpanded] = useState<boolean | null>(null);
  if (!text.trim()) return null;
  return (
    <details open={expanded ?? active} className="group rounded-xl bg-surface px-4 py-2.5 text-ui text-text-2" data-testid="thinking-summary">
      <summary onClick={(event) => { event.preventDefault(); setExpanded(!(expanded ?? active)); }} className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber [&::-webkit-details-marker]:hidden">
        <span>{active ? "Thinking" : "Thinking summary"}</span>
        <ChevronDown aria-hidden className="size-3.5 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <p className="mt-3 max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap wrap-anywhere"><StreamingText text={text} active={active} /></p>
    </details>
  );
}
