"use client";

import { ArrowDown, ChevronDown, ChevronUp, CircleAlert, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type UIEvent } from "react";

import { cn } from "@/lib/ui/cn";

import type { ChatDockProps } from "../contracts";

import { describeChatError } from "./chat-errors";
import { extractChatPlaces, toolPlaceEvents } from "./chat-places";
import { Composer } from "./composer";
import {
  collapsedSnapshot,
  isAtBottom,
  listMaxHeight,
  listMode,
  subscribeCollapsed,
  writeCollapsed,
} from "./dock-layout";
import { MessageList } from "./message-list";
import { useChatSession } from "./use-chat-session";

// The glass chat dock for a trip. Owns the durable chat session; hands
// place hover and click out to the map and the board, and every batch of
// places a tool streams (preliminary and final) to `onPlaces`, so the board
// and the map fill before the model finishes talking. Props: ChatDockProps
// in components/trip/contracts.ts.
//
// Layout (Paper "02 Discover board", "F7 Agent searching"): a 920 px glass
// panel, the toggle centered 17 px above it. At rest the list peeks at the
// tail of the last reply (the dock is about 177 px). While the agent works,
// and until the advisor clicks back on the board, the dock grows upward to
// fit the last turn, capped at 46 percent of the viewport; earlier turns
// scroll inside it. The list stays pinned to the bottom while it streams
// unless the advisor has scrolled up ("Jump to latest" brings it back). The
// chevron hides the list and keeps the composer, remembered per chat for the
// browser session. The composer is always visible.

export type { ChatDockProps };

// The CSS pipeline rewrites the `glass-dock` utility's backdrop-filter to only
// the -webkit- form, which Chrome ignores, so the frost is set inline from
// the same token.
const GLASS_STYLE = { backdropFilter: "var(--glass-dock-filter)" } as const;

/** A scroll this soon after wheel, touch or a scroll key counts as the reader's. */
const USER_SCROLL_WINDOW_MS = 800;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

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

  // Layout state (dock-layout.ts). `expanded` opens the list beyond the peek;
  // `reading` lets it use the whole cap once the advisor scrolls into earlier turns.
  const collapsed = useSyncExternalStore(subscribeCollapsed, () => collapsedSnapshot(chatId), () => false);
  const [expanded, setExpanded] = useState(busy);
  const [reading, setReading] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [lastTurnHeight, setLastTurnHeight] = useState<number | null>(null);
  const [prevBusy, setPrevBusy] = useState(busy);
  if (busy !== prevBusy) {
    setPrevBusy(busy);
    // A reply started (here, in another tab, or on reconnect): show it.
    if (busy) setExpanded(true);
  }
  const mode = listMode({ collapsed, expanded });
  const listId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const userScrollAt = useRef(0);
  const pointerHeld = useRef(false);

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

  // Follow the content: measure the last turn and stay at the bottom while pinned.
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const observer = new ResizeObserver(() => {
      const users = content.querySelectorAll<HTMLElement>('[data-testid="user-message"]');
      const start = users[users.length - 1] ?? content.querySelector<HTMLElement>('[data-testid="assistant-message"]');
      setLastTurnHeight(start ? content.offsetHeight - start.offsetTop : null);
      if (pinned.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(content);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [mode]);

  // Back on the board with nothing running: settle to the peek.
  useEffect(() => {
    if (mode !== "open" || busy) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && sectionRef.current?.contains(event.target)) return;
      pinned.current = true;
      setExpanded(false);
      setReading(false);
      setShowJump(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mode, busy]);

  // Only the reader unpins (wheel, touch, keys, scrollbar). Layout changes
  // (the list growing, the dock resizing) also fire scroll events and must
  // not stop the follow.
  const markUserScroll = () => {
    userScrollAt.current = Date.now();
  };
  const onListScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const byReader = pointerHeld.current || Date.now() - userScrollAt.current < USER_SCROLL_WINDOW_MS;
    if (isAtBottom(el)) {
      pinned.current = true;
      setShowJump(false);
    } else if (byReader) {
      pinned.current = false;
      setShowJump(true);
      // Once reading back, keep the full height until the next turn or the
      // peek, so the list does not shrink under the reader's eyes.
      if (mode === "open") setReading(true);
    }
  };

  const jumpToLatest = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    pinned.current = true;
    setShowJump(false);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  const open = () => {
    if (collapsed) writeCollapsed(chatId, false);
    setExpanded(true);
  };

  const toggleCollapsed = () => {
    if (collapsed) {
      pinned.current = true;
      open();
    } else {
      writeCollapsed(chatId, true);
      setShowJump(false);
    }
  };

  const sendAndFollow = (text: string) => {
    pinned.current = true;
    setReading(false);
    setShowJump(false);
    open();
    send(text);
  };

  const hasMessages = messages.some((m) => !m.metadata?.hidden);
  const maxHeight = listMaxHeight(mode, lastTurnHeight, reading);

  return (
    <section
      ref={sectionRef}
      aria-label="Trip agent"
      data-testid="chat-dock"
      data-busy={busy ? "true" : "false"}
      data-list={mode}
      style={GLASS_STYLE}
      className={cn(
        "glass-dock relative flex max-h-[max(46dvh,320px)] min-h-0 flex-col gap-3 rounded-dock border border-white/60 p-[18px] shadow-dock",
        className,
      )}
    >
      {toggle ? <div className="absolute bottom-full left-1/2 mb-[17px] -translate-x-1/2">{toggle}</div> : null}
      <header className="flex shrink-0 items-center justify-between gap-2 px-1">
        <span className="label-caps text-text-2">Agent</span>
        <div className="flex items-center gap-2">
          {busy ? <span className="label-caps text-amber">{stopping ? "Stopping" : "Working"}</span> : null}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls={collapsed ? undefined : listId}
            aria-label={collapsed ? "Show conversation" : "Hide conversation"}
            title={collapsed ? "Show conversation" : "Hide conversation"}
            data-testid="dock-collapse"
            className="-my-1 inline-flex size-7 items-center justify-center rounded-pill text-text-2 transition-colors hover:bg-surface-raised hover:text-ink"
          >
            {collapsed ? (
              <ChevronUp aria-hidden className="size-4" strokeWidth={2} />
            ) : (
              <ChevronDown aria-hidden className="size-4" strokeWidth={2} />
            )}
          </button>
        </div>
      </header>

      {mode === "hidden" ? null : (
        <div className="relative flex min-h-0 flex-initial flex-col">
          <div
            id={listId}
            ref={scrollRef}
            data-testid="chat-scroll"
            onScroll={onListScroll}
            onWheel={(event) => {
              markUserScroll();
              if (mode === "peek" && event.deltaY < 0) setExpanded(true);
            }}
            onTouchMove={markUserScroll}
            onKeyDown={(event) => {
              if (SCROLL_KEYS.has(event.key)) markUserScroll();
            }}
            onPointerDown={(event) => {
              // The scrollbar itself: the pointer lands on the scroller, not on a message.
              if (event.target !== event.currentTarget) return;
              pointerHeld.current = true;
              const release = () => {
                pointerHeld.current = false;
              };
              window.addEventListener("pointerup", release, { once: true });
              window.addEventListener("pointercancel", release, { once: true });
            }}
            onClick={mode === "peek" ? () => setExpanded(true) : undefined}
            onFocus={mode === "peek" ? () => setExpanded(true) : undefined}
            style={maxHeight === undefined ? undefined : { maxHeight }}
            className={cn(
              "min-h-0 flex-initial overflow-y-auto overscroll-contain px-1",
              mode === "peek" && "cursor-pointer overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_60%)]",
            )}
          >
            <div ref={contentRef} className="relative">
              {hasMessages ? (
                <MessageList
                  messages={messages}
                  streaming={busy}
                  onRetryAsk={retryAsk}
                  onPlacesHover={onPlacesHover}
                  onPlaceClick={onPlaceClick}
                  placeName={placeName}
                />
              ) : (
                <p className="text-text-2">Ask for places, a day plan, or what this client would love.</p>
              )}
            </div>
          </div>
          {showJump && mode === "open" ? (
            <button
              type="button"
              onClick={jumpToLatest}
              data-testid="jump-to-latest"
              className="rise-in absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-pill bg-ink px-3 py-1.5 text-ui-sm font-semibold text-surface shadow-menu"
            >
              <ArrowDown aria-hidden className="size-3.5" strokeWidth={2} />
              Jump to latest
            </button>
          ) : null}
        </div>
      )}

      {problem && !busy ? (
        <div role="alert" data-testid="chat-error" className="flex shrink-0 items-start gap-2 rounded-card bg-surface-raised px-3 py-2 hairline">
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

      <div className="shrink-0">
        <Composer busy={busy} stopping={stopping} onSend={sendAndFollow} onStop={() => void stop()} />
      </div>
    </section>
  );
}
