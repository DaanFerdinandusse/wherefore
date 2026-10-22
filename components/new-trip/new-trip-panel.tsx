"use client";

import { useEffect, useEffectEvent, useId, useReducer, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import type { Destination } from "@/lib/contracts";
import {
  loadPastDestinations,
  loadTripBarContext,
  type TripBarClient,
  type TripBarContext,
} from "@/lib/trips/actions";
import type { PastDestination } from "@/lib/trips/contracts";
import { cn } from "@/lib/ui/cn";

import { firstName } from "@/components/trips/format";

import { BarSegment, type SegmentKey } from "./bar-segment";
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
import type { CreateTripResponse } from "./request";
import { TravelersMenu } from "./travelers-menu";
import { WhenMenu } from "./when-menu";
import { WhereMenu } from "./where-menu";
import { WhoMenu } from "./who-menu";

// The New trip panel (F1 to F4, D): a canvas panel under the app bar over a
// scrim, with the booking-style bar For who | Where | When | Travelers |
// Create trip. Each segment opens its own menu under the bar, and picking a
// value moves on to the next one. Create trip is enabled once who and where
// are set; it posts to /api/trips and hands the new id to `onCreated`.
// Escape closes the open menu first, then the panel.
function toDraftClient(client: TripBarClient): DraftClient {
  return {
    id: client.id,
    name: client.name,
    homeCity: client.homeCity,
    avatarUrl: client.avatarUrl,
    favoritesCount: client.favoritesCount,
  };
}

export function NewTripPanel({
  clientId,
  where,
  newClientHref,
  onClose,
  onCreated,
}: {
  /** `?client=<id>`: prefill For who (D). */
  clientId: string | null;
  /** `?where=<name>`: start the destination search with this name. */
  where: string | null;
  newClientHref: string;
  onClose: () => void;
  onCreated: (tripId: string) => void;
}) {
  const titleId = useId();
  const [draft, dispatch] = useReducer(draftReducer, null, () => initialDraft());
  const [context, setContext] = useState<TripBarContext | null>(null);
  const [contextError, setContextError] = useState(false);
  const [pastByClient, setPastByClient] = useState<Record<string, PastDestination[]>>({});
  const [open, setOpen] = useState<SegmentKey | null>(clientId || where ? null : "who");
  const [whereQuery, setWhereQuery] = useState(where ?? "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const firstSegmentRef = useRef<HTMLDivElement>(null);

  // What the menus show before typing: recent clients, cities, the prefill.
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

  // Escape: the open menu first, then the panel. Scroll stays on the panel.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || creating) return;
    if (open) setOpen(null);
    else onClose();
  });
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    firstSegmentRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = overflow;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
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
    setOpen("when");
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
  const order: SegmentKey[] = ["who", "where", "when", "travelers"];
  const divider = (key: SegmentKey) => {
    const index = order.indexOf(key);
    return index > 0 && open !== key && open !== order[index - 1];
  };
  const segment = (key: SegmentKey) => ({
    open: open === key,
    onOpenChange: (next: boolean) => setOpen(next ? key : open === key ? null : open),
    divider: divider(key),
  });

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-x-0 top-[76px] bottom-0 z-40">
      <div aria-hidden className="absolute inset-0 bg-scrim-soft" onClick={() => !creating && onClose()} />

      <div className="rise-in relative flex flex-col items-center gap-6 border-t border-rule bg-canvas px-7 pt-7 pb-9 shadow-menu">
        <div className="flex w-full max-w-[1100px] items-center justify-between gap-6">
          <h2 id={titleId} className="font-display text-title leading-[54px] text-ink">
            {title}
          </h2>
          <IconButton
            label="Close new trip"
            variant="outline"
            size={40}
            icon={<X size={14} strokeWidth={2} aria-hidden />}
            onClick={onClose}
            disabled={creating}
          />
        </div>

        <div className="flex h-[84px] w-full max-w-[1100px] shrink-0 items-center rounded-pill border border-pill-outline bg-surface p-2">
          <div ref={firstSegmentRef} className="contents">
            <BarSegment
              label="For who"
              value={whoSummary(draft)}
              placeholder="Choose a client"
              panelLabel="Choose a client"
              kind="menu"
              className="flex-[1.3_1_0px]"
              panelClassName="w-[460px]"
              {...segment("who")}
            >
              <WhoMenu
                recentClients={context?.recentClients ?? []}
                loading={!context && !contextError}
                selectedId={draft.client?.id ?? null}
                newClientHref={newClientHref}
                onSelect={selectClient}
              />
            </BarSegment>
          </div>

          <BarSegment
            label="Where"
            value={open === "where" && whereQuery.trim() ? whereQuery : whereSummary(draft)}
            placeholder="Search destinations"
            panelLabel="Choose a destination"
            className="flex-[1.2_1_0px]"
            panelClassName="w-[440px]"
            {...segment("where")}
          >
            <WhereMenu
              query={whereQuery}
              onQueryChange={setWhereQuery}
              cities={context?.cities ?? []}
              pastDestinations={past}
              clientName={clientName}
              selected={draft.destination}
              onSelect={selectDestination}
            />
          </BarSegment>

          <BarSegment
            label="When"
            value={whenSummary(draft)}
            placeholder="Add dates"
            panelLabel="Choose dates"
            align="center"
            className="flex-[1_1_0px]"
            panelClassName="w-[720px] px-8! pt-5! pb-6!"
            {...segment("when")}
          >
            <WhenMenu
              range={draft.range}
              mode={draft.datesMode}
              onRangeChange={(range) => dispatch({ type: "setRange", range })}
              onModeChange={(mode) => dispatch({ type: "setDatesMode", mode })}
              onClear={() => dispatch({ type: "clearDates" })}
              onNext={() => setOpen("travelers")}
            />
          </BarSegment>

          <BarSegment
            label="Travelers"
            value={travelersSummary(draft)}
            placeholder="Add travelers"
            panelLabel="Who is traveling"
            align="end"
            className="flex-[0.9_1_0px]"
            panelClassName="w-[460px] pb-4!"
            {...segment("travelers")}
          >
            <TravelersMenu draft={draft} dispatch={dispatch} onChooseClient={() => setOpen("who")} />
          </BarSegment>

          <Button
            size="lg"
            loading={creating}
            disabled={!canCreate(draft)}
            onClick={create}
            className={cn("ml-2 h-[68px]! gap-2.5! px-7! text-body-lg!", "disabled:opacity-35!")}
          >
            Create trip
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Button>
        </div>

        {createError || contextError ? (
          <p role="alert" className="-mt-2 w-full max-w-[1100px] px-6 text-ui text-amber">
            {createError ?? "Could not load your clients and cities. Close the panel and try again."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
