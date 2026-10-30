"use client";

import { ArrowDown, CircleAlert, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import type { ChatOpening } from "@/lib/contracts";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/ui/cn";

import type { ChatDockProps } from "../contracts";
import { verdictOf } from "../itinerary-view/itinerary-model";
import { PlaceCard, type PlaceCardActions } from "../place-profile/place-card";
import { useTripStore } from "../store";
import { useWorkspaceActions } from "../workspace/use-workspace-actions";

import { describeChatError } from "./chat-errors";
import {
  composerPlaceholder,
  liveRecommendationId,
  mainNeighborhood,
  picksByAsk,
  recommendationByPlace,
  type Recommendation,
} from "./chat-format";
import { extractChatPlaces, placesMetaOf, toolPlaceEvents } from "./chat-places";
import { Composer } from "./composer";
import { isAtBottom } from "./dock-layout";
import { Thread } from "./thread";
import { useChatSession } from "./use-chat-session";

// The v3 chat column (Paper G1, S1 to S5, J1): the left half of the trip
// workspace. The thread fills the column and scrolls, pinned to the bottom
// while it streams unless the advisor scrolls up ("Jump to latest" brings it
// back); the composer is docked at the bottom over a fade. An empty chat
// opens with a message composed in code from the trip's facts (no model run
// until the advisor sends the brief). A place selected anywhere (the
// itinerary or map) opens the full place card in a modal;
// Close or Escape returns to the thread.
//
// Must render inside the trip store (TripStoreProvider): it reads the trip,
// the itinerary and the selected place, and writes through the workspace
// actions. The durable chat session (reconnect, optimistic pending prompt)
// is useChatSession, unchanged.

export type ChatColumnProps = Omit<ChatDockProps, "toggle"> & {
  /** The workspace's own actions, so slot writes share one queue. Defaults to a fresh set. */
  actions?: PlaceCardActions;
  /** The opening, when the page loaded it already (else it is fetched for an empty chat). */
  opening?: ChatOpening;
};

const openingSchema = z.object({
  created: z.string(),
  createdFrom: z.string(),
  paragraphs: z.array(z.string()),
  placeholder: z.string(),
});

/** The space above a search when its pick brings it to the top of the thread. */
const PICK_TOP_GAP = 12;
/** While that scroll runs, passing near the bottom must not pin the thread again. */
const PICK_SCROLL_MS = 1200;
/** A scroll this soon after wheel, touch or a scroll key counts as the reader's. */
const USER_SCROLL_WINDOW_MS = 800;

function useOpening(chatId: string, needed: boolean, given?: ChatOpening) {
  const [loaded, setLoaded] = useState<{ chatId: string; opening: ChatOpening } | null>(null);
  useEffect(() => {
    if (!needed || given) return;
    const controller = new AbortController();
    fetch(`/api/chats/${encodeURIComponent(chatId)}/opening`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const parsed = openingSchema.safeParse(await response.json());
        if (parsed.success) setLoaded({ chatId, opening: parsed.data });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [chatId, needed, given]);
  return given ?? (loaded?.chatId === chatId ? loaded.opening : null);
}

export function ChatColumn({
  chatId,
  initial,
  onPlaces,
  onPlacesHover,
  onPlaceClick,
  className,
  actions: givenActions,
  opening: givenOpening,
}: ChatColumnProps) {
  const session = useChatSession({ chatId, initial });
  const { messages, busy, stopping, error, server, send, retryLast, stop } = session;

  const trip = useTripStore((s) => s.trip);
  const slots = useTripStore((s) => s.slots);
  const places = useTripStore((s) => s.places);
  const selectedPlaceId = useTripStore((s) => s.selectedPlaceId);
  const select = useTripStore((s) => s.select);
  const setHighlight = useTripStore((s) => s.setHighlight);
  const chatPrompt = useTripStore((s) => s.chatPrompt);
  const clearChatPrompt = useTripStore((s) => s.clearChatPrompt);
  const showToast = useTripStore((s) => s.showToast);
  const workspaceActions = useWorkspaceActions();
  const actions = givenActions ?? workspaceActions;

  const hover = onPlacesHover ?? setHighlight;
  const open = onPlaceClick ?? select;

  // Each tool output is announced once per change (phase, count, reasons, pick).
  const announced = useRef(new Set<string>());
  const onPlacesRef = useRef(onPlaces);
  useEffect(() => {
    onPlacesRef.current = onPlaces;
  }, [onPlaces]);
  useEffect(() => {
    for (const event of toolPlaceEvents(messages)) {
      if (announced.current.has(event.key)) continue;
      announced.current.add(event.key);
      onPlacesRef.current?.(event.places, placesMetaOf(event));
    }
  }, [messages]);

  const empty = !messages.some((m) => !m.metadata?.hidden);
  const opening = useOpening(chatId, empty, givenOpening);
  const liveId = useMemo(() => liveRecommendationId(messages), [messages]);
  const picks = useMemo(() => picksByAsk(messages), [messages]);
  const byPlace = useMemo(() => recommendationByPlace(messages), [messages]);
  const chatPlaces = useMemo(() => new Map(extractChatPlaces(messages).map((p) => [p.tripPlaceId, p])), [messages]);
  const placeName = useCallback((id: string) => places[id]?.name ?? chatPlaces.get(id)?.name, [places, chatPlaces]);
  const neighborhood = useMemo(() => mainNeighborhood(Object.values(places), slots), [places, slots]);
  const placeholder = composerPlaceholder({
    empty,
    busy,
    clientName: trip.clientName,
    destination: trip.destination.name,
    neighborhood,
    openingPlaceholder: opening?.placeholder,
  });

  const problem =
    describeChatError(error) ??
    (server.status === "failed" && !busy ? describeChatError(server.lastError ?? "The last reply failed.") : undefined);

  // Retry from a tool card re-sends the user message that led to that reply.
  const retryAsk = useCallback(
    (assistantMessageId: string) => {
      const index = messages.findIndex((m) => m.id === assistantMessageId);
      const ask = messages.slice(0, index === -1 ? messages.length : index).findLast((m) => m.role === "user");
      const text = ask?.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
      if (text) send(text);
    },
    [messages, send],
  );

  // ----------------------------------------------------------- scrolling
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const userScrollAt = useRef(0);
  const pickScrollEnds = useRef(0);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(content);
    observer.observe(scroller);
    scroller.scrollTop = scroller.scrollHeight;
    return () => observer.disconnect();
  }, []);

  const markUserScroll = () => {
    userScrollAt.current = Date.now();
  };
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || Date.now() < pickScrollEnds.current) return;
    if (isAtBottom(el)) {
      pinned.current = true;
      setShowJump(false);
    } else if (Date.now() - userScrollAt.current < USER_SCROLL_WINDOW_MS) {
      pinned.current = false;
      setShowJump(true);
    }
  };
  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = true;
    setShowJump(false);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };
  // A new pick lands in the thread: bring its search to the top of the view, so
  // the chip row and the card read together instead of the bottom edge of the card.
  const seenCard = useRef(liveId);
  useEffect(() => {
    if (liveId === seenCard.current) return;
    seenCard.current = liveId;
    const scroller = scrollRef.current;
    const search = [...(contentRef.current?.querySelectorAll('[data-testid="search-results"]') ?? [])].at(-1);
    if (!busy || !pinned.current || !scroller || !search) return;
    pinned.current = false;
    pickScrollEnds.current = Date.now() + PICK_SCROLL_MS;
    const top = search.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - PICK_TOP_GAP;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }, [liveId, busy]);

  const sendAndFollow = (text: string) => {
    pinned.current = true;
    setShowJump(false);
    send(text);
  };

  // A prompt from the map waits for the reply in progress, then goes out like a typed message.
  const sendRef = useRef(sendAndFollow);
  useEffect(() => {
    sendRef.current = sendAndFollow;
  });
  useEffect(() => {
    if (!chatPrompt) return;
    if (busy) {
      showToast("This search starts when the current reply ends");
      return;
    }
    clearChatPrompt();
    sendRef.current(chatPrompt.text);
  }, [chatPrompt, busy, clearChatPrompt, showToast]);

  // ------------------------------------------------- the card over the thread
  const selected = selectedPlaceId ? (places[selectedPlaceId] ?? chatPlaces.get(selectedPlaceId)) : undefined;
  const selectedRecommendation = selected ? byPlace.get(selected.tripPlaceId) : undefined;

  const asks = useTripStore((s) => s.asks);
  const renderCard = (recommendation: Recommendation) => (
    <PlaceCard
      key={recommendation.card.tripPlaceId}
      card={places[recommendation.card.tripPlaceId] ?? recommendation.card}
      trip={trip}
      slots={slots}
      target={recommendation.target}
      clientNote={recommendation.clientNote}
      verdict={recommendation.verdict ?? verdictOf(asks, recommendation.card.tripPlaceId)}
      actions={actions}
      onHover={hover}
    />
  );

  return (
    <section
      aria-label="Trip chat"
      data-testid="chat-column"
      data-busy={busy ? "true" : "false"}
      className={cn("relative flex h-full min-h-0 flex-col bg-canvas", className)}
    >
      <div
        ref={scrollRef}
        data-testid="chat-scroll"
        onScroll={onScroll}
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest("[data-photo-toggle]")) {
            pinned.current = false;
            setShowJump(true);
          }
        }}
        onWheel={markUserScroll}
        onTouchMove={markUserScroll}
        onKeyDown={markUserScroll}
        className="-mr-5 -ml-7 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-5 pl-7 max-xl:-ml-4 max-xl:pl-4"
        style={{ overflowAnchor: "none" }}
      >
        <div ref={contentRef} className="flex min-h-full flex-col justify-end pt-9 pb-28">
          <Thread
            messages={messages}
            streaming={busy}
            opening={opening}
            liveRecommendationId={liveId}
            picks={picks}
            slots={slots}
            clientName={trip.clientName}
            onRetryAsk={retryAsk}
            renderCard={renderCard}
            placeName={placeName}
            onPlacesHover={hover}
            onPlaceClick={open}
          />
        </div>
      </div>

      <Sheet
        open={Boolean(selected)}
        onClose={() => select(null)}
        label={selected?.name ?? "Place details"}
        side="center"
        className="w-[min(900px,100%)]! bg-canvas! p-6!"
      >
        {selected ? (
          <PlaceCard
            key={selected.tripPlaceId}
            card={selected}
            trip={trip}
            slots={slots}
            target={selectedRecommendation?.target}
            clientNote={selectedRecommendation?.clientNote}
            verdict={verdictOf(asks, selected.tripPlaceId)}
            variant="overlay"
            onClose={() => select(null)}
            actions={actions}
            onHover={hover}
          />
        ) : null}
      </Sheet>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 bg-linear-to-b from-canvas/0 to-canvas to-45% pt-10 pb-1">
        {showJump && !selected ? (
          <button
            type="button"
            onClick={jumpToLatest}
            data-testid="jump-to-latest"
            className="rise-in pointer-events-auto mx-auto inline-flex items-center gap-1.5 rounded-pill bg-ink px-3 py-1.5 text-ui-sm font-semibold text-surface shadow-menu"
          >
            <ArrowDown aria-hidden className="size-3.5" strokeWidth={2} />
            Jump to latest
          </button>
        ) : null}
        {problem && !busy ? (
          <div
            role="alert"
            data-testid="chat-error"
            className="pointer-events-auto flex items-start gap-2 rounded-card bg-surface-raised px-3.5 py-2.5 shadow-soft"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" strokeWidth={1.75} />
            <p className="text-ui text-ink">
              {problem.problem} <span className="text-text-2">{problem.recovery}</span>
            </p>
            {problem.retry ? (
              <button
                type="button"
                onClick={retryLast}
                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-ui text-ink ring-1 ring-ink/12 hover:bg-surface"
              >
                <RotateCcw aria-hidden className="size-3" strokeWidth={1.75} />
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        <Composer
          className="pointer-events-auto"
          busy={busy}
          stopping={stopping}
          placeholder={placeholder}
          onSend={sendAndFollow}
          onStop={() => void stop()}
        />
      </div>
    </section>
  );
}
