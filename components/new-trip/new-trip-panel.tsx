"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowRight, Heart, X } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import { firstName } from "@/components/trips/format";
import type { Destination } from "@/lib/contracts";
import {
  loadPastDestinations,
  loadTripBarContext,
  type TripBarClient,
  type TripBarContext,
} from "@/lib/trips/actions";
import type { PastDestination } from "@/lib/trips/contracts";
import { cn } from "@/lib/ui/cn";
import { useFocusTrap } from "@/lib/ui/use-focus-trap";

import { BarSegment, SEGMENT_ORDER, type SegmentKey } from "./bar-segment";
import {
  canCreate,
  draftReducer,
  initialDraft,
  toCreateTripRequest,
  travelersSummary,
  whenSummary,
  whereSummary,
  whoSummary,
  type DraftClient,
} from "./draft";
import { createHint } from "./format";
import type { CreateTripResponse } from "./request";
import { TravelersMenu } from "./travelers-menu";
import { WhenMenu } from "./when-menu";
import { WhereMenu } from "./where-menu";
import { WhoMenu } from "./who-menu";

// The New trip panel (N1 to N4): a rounded sheet anchored to the top over the
// dimmed page, with the Bodoni title, Close, and the booking-style bar For
// who | Where | When | Travelers | Create trip. The open segment's dropdown
// hangs under the sheet; picking a value moves on to the next segment.
// Create trip is enabled once who and where are set; then a line under the
// bar says what happens next (the trip opens with a chat, nothing searches
// before the advisor asks). Escape closes the dropdown first, then the panel.
// While it is open the page behind it is inert and Tab cycles inside the
// panel; on close focus goes back to what opened it.

/** Makes everything outside `panel` inert; returns the elements to release. */
function inertBackground(panel: HTMLElement): HTMLElement[] {
  const changed: HTMLElement[] = [];
  let node: HTMLElement = panel;
  while (node.parentElement && node !== document.body) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      sibling.inert = true;
      changed.push(sibling);
    }
    node = node.parentElement;
  }
  return changed;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab wrap around inside the panel. */
function trapTab(event: KeyboardEvent, panel: HTMLElement) {
  const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !(active instanceof Node) || !panel.contains(active);
  if (event.shiftKey && (active === first || outside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || outside)) {
    event.preventDefault();
    first.focus();
  }
}

/** The nav drawer's "New trip", when the panel opened from a link or a page load. */
function launcherButton(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("button, a")).find(
      (b) => b.textContent?.trim() === "New trip" && b.getClientRects().length > 0,
    ) ?? null
  );
}

function toDraftClient(client: TripBarClient): DraftClient {
  return {
    id: client.id,
    name: client.name,
    homeCity: client.homeCity,
    avatarUrl: client.avatarUrl,
    favoritesCount: client.favoritesCount,
  };
}

/**
 * Where each dropdown hangs under the sheet (40px side padding, a 7px bar
 * padding and 1px border). When is centered under its segment: the segments
 * scale together from 259, 240, 220, 204 and 178 (1101 at full width), so
 * its center sits at 609 of 1101, after two 1px dividers.
 */
const DROP_PLACEMENT: Record<SegmentKey, string> = {
  who: "left-10 w-[760px] p-3",
  where: "inset-x-10 p-6",
  when: "left-[calc(50px+(100%-99px)*0.5531)] w-[728px] -translate-x-1/2 px-8 py-6",
  travelers: "right-10 w-[600px] p-3",
};

const DROP_LABEL: Record<SegmentKey, string> = {
  who: "Choose a client",
  where: "Choose a destination",
  when: "Choose dates",
  travelers: "Who is traveling",
};

export function NewTripPanel({
  clientId,
  where,
  newClientHref,
  onClose,
  onCreated,
}: {
  /** `?client=<id>`: prefill For who. */
  clientId: string | null;
  /** `?where=<name>`: start the destination search with this name. */
  where: string | null;
  newClientHref: string;
  onClose: () => void;
  onCreated: (tripId: string) => void;
}) {
  const titleId = useId();
  const dropId = useId();
  const [draft, dispatch] = useReducer(draftReducer, null, () => initialDraft());
  const [context, setContext] = useState<TripBarContext | null>(null);
  const [contextError, setContextError] = useState(false);
  const [pastByClient, setPastByClient] = useState<Record<string, PastDestination[]>>({});
  const [open, setOpen] = useState<SegmentKey | null>(clientId || where ? null : "who");
  const [whereQuery, setWhereQuery] = useState(where ?? "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // The open segment's button: the dropdown's focus returns there.
  const openTriggerRef = useRef<HTMLButtonElement>(null);
  // Whether a dropdown was open when a press on the scrim started: that press
  // only closes the dropdown, the next one closes the panel.
  const dropOpenOnPress = useRef(false);

  // What the dropdowns show before typing: recent clients, cities, the prefill.
  useEffect(() => {
    let live = true;
    loadTripBarContext({ clientId })
      .then((ctx) => {
        if (!live) return;
        setContext(ctx);
        if (ctx.prefill) {
          dispatch({ type: "setClient", client: toDraftClient(ctx.prefill) });
          setPastByClient((p) => ({ ...p, [ctx.prefill!.id]: ctx.pastDestinations }));
        }
        if (clientId || where) setOpen(ctx.prefill || !clientId ? "where" : "who");
      })
      .catch(() => {
        if (live) setContextError(true);
      });
    return () => {
      live = false;
    };
  }, [clientId, where]);

  // Escape: the open dropdown first (its focus trap handles that), then the
  // panel. Scroll stays on the panel.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key === "Tab" && panelRef.current) return trapTab(event, panelRef.current);
    if (event.key !== "Escape" || creating) return;
    if (open) setOpen(null);
    else onClose();
  });
  useEffect(() => {
    const active = document.activeElement;
    const previous = active instanceof HTMLElement && active !== document.body ? active : null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const inerted = panelRef.current ? inertBackground(panelRef.current) : [];
    window.addEventListener("keydown", onKey);
    // The open dropdown (a child, so its effect ran first) may already hold focus.
    if (!panelRef.current?.contains(document.activeElement)) {
      barRef.current?.querySelector("button")?.focus({ preventScroll: true });
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = overflow;
      for (const el of inerted) el.inert = false;
      const back = previous && document.contains(previous) ? previous : launcherButton();
      back?.focus({ preventScroll: true });
    };
  }, []);

  function selectClient(client: TripBarClient) {
    dispatch({ type: "setClient", client: toDraftClient(client) });
    setOpen(draft.destination ? null : "where");
    if (!pastByClient[client.id]) {
      loadPastDestinations(client.id)
        .then((past) => setPastByClient((p) => ({ ...p, [client.id]: past })))
        .catch(() => undefined);
    }
  }

  function selectDestination(destination: Destination) {
    dispatch({ type: "setDestination", destination });
    setWhereQuery("");
    setOpen(draft.range.start || draft.datesMode === "unset" ? null : "when");
  }

  async function create() {
    const body = toCreateTripRequest(draft);
    if (!body) return;
    setCreating(true);
    setCreateError(null);
    setOpen(null);
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as
        | CreateTripResponse
        | { error?: { message?: string } | string }
        | null;
      if (!response.ok || !json || !("trip" in json)) {
        const error = json && "error" in json ? json.error : undefined;
        const message = typeof error === "string" ? error : error?.message;
        throw new Error(message ?? "Could not create the trip. Try again.");
      }
      onCreated(json.trip.id);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create the trip. Try again.");
      setCreating(false);
    }
  }

  const clientName = draft.client?.name ?? null;
  const past = draft.client ? (pastByClient[draft.client.id] ?? []) : [];
  const title = clientId && context?.prefill ? `New trip for ${firstName(context.prefill.name)}` : "New trip";
  const ready = canCreate(draft);

  function divider(key: SegmentKey): boolean | null {
    const index = SEGMENT_ORDER.indexOf(key);
    if (index === 0) return null;
    return open !== key && open !== SEGMENT_ORDER[index - 1];
  }
  const toggle = (key: SegmentKey) => () => setOpen((current) => (current === key ? null : key));

  let dropdown: ReactNode = null;
  if (open === "who") {
    dropdown = (
      <WhoMenu
        recentClients={context?.recentClients ?? []}
        loading={!context && !contextError}
        selectedId={draft.client?.id ?? null}
        newClientHref={newClientHref}
        onSelect={selectClient}
      />
    );
  } else if (open === "where") {
    dropdown = (
      <WhereMenu
        query={whereQuery}
        onQueryChange={setWhereQuery}
        cities={context?.cities ?? []}
        cityImages={context?.cityImages ?? []}
        pastDestinations={past}
        clientName={clientName}
        selected={draft.destination}
        onSelect={selectDestination}
      />
    );
  } else if (open === "when") {
    dropdown = (
      <WhenMenu
        range={draft.range}
        mode={draft.datesMode}
        onRangeChange={(range) => dispatch({ type: "setRange", range })}
        onModeChange={(mode) => dispatch({ type: "setDatesMode", mode })}
        onClear={() => dispatch({ type: "clearDates" })}
        onNext={() => setOpen("travelers")}
      />
    );
  } else if (open === "travelers") {
    dropdown = <TravelersMenu draft={draft} dispatch={dispatch} onChooseClient={() => setOpen("who")} />;
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain px-4 pt-10 pb-16"
    >
      <div
        aria-hidden
        className="fixed inset-0 bg-scrim-soft"
        onPointerDown={() => {
          dropOpenOnPress.current = open !== null;
        }}
        onClick={() => {
          if (!creating && !dropOpenOnPress.current) onClose();
        }}
      />

      <div
        className="rise-in relative mx-auto flex w-full max-w-[1200px] flex-col gap-6 rounded-sheet bg-surface px-10 pt-8 pb-9 shadow-panel"
      >
        <div className="flex h-[60px] items-center justify-between gap-6">
          <h2 id={titleId} className="font-display text-title leading-[60px] tracking-[-0.01em] text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-pill border border-ink/20 bg-surface-raised pr-[18px] pl-3.5 text-ui font-semibold text-ink transition-colors hover:border-ink disabled:opacity-45"
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
        </div>

        <div ref={barRef} className="flex h-[84px] w-full shrink-0 items-center rounded-pill border border-rule bg-surface-raised p-[7px]">
          <BarSegment
            label="For who"
            value={whoSummary(draft)}
            placeholder="Choose a client"
            className="flex-[1_1_259px]"
            open={open === "who"}
            onToggle={toggle("who")}
            buttonRef={open === "who" ? openTriggerRef : undefined}
            controls={dropId}
            divider={divider("who")}
          />
          <BarSegment
            label="Where"
            value={open === "where" && whereQuery.trim() ? whereQuery : whereSummary(draft)}
            placeholder="Add a city"
            className="flex-[1_1_240px]"
            open={open === "where"}
            onToggle={toggle("where")}
            buttonRef={open === "where" ? openTriggerRef : undefined}
            controls={dropId}
            divider={divider("where")}
          />
          <BarSegment
            label="When"
            value={whenSummary(draft)}
            placeholder="Add dates"
            className="flex-[1_1_220px]"
            open={open === "when"}
            onToggle={toggle("when")}
            buttonRef={open === "when" ? openTriggerRef : undefined}
            controls={dropId}
            divider={divider("when")}
          />
          <BarSegment
            label="Travelers"
            value={travelersSummary(draft)}
            placeholder="Add travelers"
            className="flex-[1_1_204px]"
            open={open === "travelers"}
            onToggle={toggle("travelers")}
            buttonRef={open === "travelers" ? openTriggerRef : undefined}
            controls={dropId}
            divider={divider("travelers")}
          />
          <button
            type="button"
            onClick={create}
            disabled={!ready || creating}
            aria-busy={creating || undefined}
            className={cn(
              "flex h-[68px] min-w-0 flex-[1_1_178px] items-center justify-center gap-2.5 rounded-pill text-body-lg leading-[22px] font-semibold transition-colors",
              ready ? "bg-ink text-white hover:bg-text-4" : "cursor-not-allowed bg-canvas text-text-muted",
              creating && "cursor-progress",
            )}
          >
            {creating ? <Spinner size={16} /> : null}
            {creating ? "Creating" : "Create trip"}
            {creating ? null : <ArrowRight size={18} strokeWidth={2} aria-hidden />}
          </button>
        </div>

        {ready && clientName && !createError ? (
          <p className="-mt-2 flex items-center gap-2.5 px-7 text-body leading-5 text-text-3">
            <Heart size={18} strokeWidth={2} aria-hidden className="shrink-0 text-amber" />
            {createHint(clientName, draft.client?.favoritesCount ?? 0)}
          </p>
        ) : null}

        {createError || contextError ? (
          <p role="alert" className="-mt-2 px-7 text-body leading-5 text-amber">
            {createError ?? "Could not load your clients and cities. Close the panel and try again."}
          </p>
        ) : null}

        {open ? (
          <Drop
            key={open}
            id={dropId}
            segment={open}
            triggerRef={openTriggerRef}
            onDismiss={() => setOpen(null)}
          >
            {dropdown}
          </Drop>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The open segment's dropdown under the sheet. It keeps focus inside; Escape
 * or a press outside closes it and focus goes back to the segment. Keyed by
 * segment, so switching segments starts a fresh trap.
 */
function Drop({
  id,
  segment,
  triggerRef,
  onDismiss,
  children,
}: {
  id: string;
  segment: SegmentKey;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The trap returns focus to whatever had it when it started. Start it from
  // the segment, also when a pick in another dropdown opened this one, so
  // closing always lands on the segment.
  useEffect(() => {
    triggerRef.current?.focus({ preventScroll: true });
  }, [triggerRef]);
  useFocusTrap(ref, true, onDismiss, triggerRef);
  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={DROP_LABEL[segment]}
      tabIndex={-1}
      data-drop
      className={cn(
        "rise-in absolute top-[calc(100%+12px)] z-10 max-w-[calc(100%-80px)] rounded-menu bg-surface-raised shadow-menu focus-visible:outline-none",
        DROP_PLACEMENT[segment],
      )}
    >
      {children}
    </div>
  );
}
