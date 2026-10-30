"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, List, Map as MapIcon, Maximize2, Minimize2 } from "lucide-react";

import { AccountButton } from "@/components/shell/account-button";
import { MenuButton } from "@/components/shell/top-nav";
import { ShareButton, ShareReviewSheet, shareReview, useShareLink } from "@/components/share";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Toast } from "@/components/ui/toast";
import type { ChatSnapshot, TripSnapshot } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { ChatColumn } from "../chat/chat-column";
import { buildDays, firstName } from "../itinerary-view/itinerary-model";
import { ItineraryPanel } from "../itinerary-view/itinerary-panel";
import { TripMapPanel } from "../map/trip-map-panel";
import { TripStoreProvider, useTripStore, useTripStoreApi } from "../store";
import { TravelerView, travelerViewFromSnapshot } from "../traveler-view";

import { datesLabel } from "./format";
import { TripSwitcher, type TripSwitcherItem } from "./trip-switcher";
import type { UrlState } from "./url-state";
import { useWorkspaceActions } from "./use-workspace-actions";

// The trip workspace (G1, G2): the composition root of /trips/[tripId]. It
// hydrates the store from the server snapshot. On the canvas: the menu button
// and the trip switcher over the chat column on the left, and the trip panel
// on the right with Itinerary / Map, Traveler view, Share and a control that
// widens the panel over the chat. Nothing searches on mount: the chat starts
// with the advisor's brief.

export type TripWorkspaceProps = {
  snapshot: TripSnapshot;
  chat: ChatSnapshot;
  otherTrips: TripSwitcherItem[];
  userName: string;
  /** The advisor's display name, for the traveler preview ("Prepared by"). */
  advisorName: string | null;
  url: UrlState;
  /** The live traveler link when the trip is shared. Follows router.refresh after Share or Stop sharing. */
  shareUrl?: string;
};

export function TripWorkspace({ snapshot, url, ...rest }: TripWorkspaceProps) {
  return (
    <TripStoreProvider snapshot={snapshot} url={url}>
      <WorkspaceShell {...rest} shareToken={snapshot.trip.shareToken ?? null} />
    </TripStoreProvider>
  );
}

const TOAST_MS = 4000;

function WorkspaceShell({
  chat,
  otherTrips,
  advisorName,
  shareUrl,
  shareToken,
}: Omit<TripWorkspaceProps, "snapshot" | "url"> & { shareToken: string | null }) {
  const store = useTripStoreApi();
  const actions = useWorkspaceActions();

  const trip = useTripStore((s) => s.trip);
  const travelers = useTripStore((s) => s.travelers);
  const view = useTripStore((s) => s.view);
  const places = useTripStore((s) => s.places);
  const asks = useTripStore((s) => s.asks);
  const slots = useTripStore((s) => s.slots);
  const requestedDays = useTripStore((s) => s.requestedDays);
  const selectedPlaceId = useTripStore((s) => s.selectedPlaceId);
  const toast = useTripStore((s) => s.toast);
  const { setView, setHighlight, select, applyPlaces, dismissToast, showToast } = store.getState();

  const [expanded, setExpanded] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [justShared, setJustShared] = useState(false);
  const [movedToShared, setMovedToShared] = useState(false);
  const link = useShareLink(trip.id, shareUrl, showToast);

  const traveler = view === "traveler";
  const panelView = view === "map" ? "map" : "itinerary";
  const wide = expanded || traveler;
  const client = firstName(trip.clientName);

  // The share token follows the server: sharing refreshes the route and the page passes the new token.
  useEffect(() => {
    if ((store.getState().trip.shareToken ?? null) !== shareToken) store.getState().setShareToken(shareToken);
  }, [shareToken, store]);

  // Toasts leave on their own.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismissToast, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  // Esc lets go of the place open in the chat, then of the highlight. Sheets and menus handle their own.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      if (store.getState().selectedPlaceId) select(null);
      else if (store.getState().highlightedPlaceId) setHighlight(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, select, setHighlight]);

  const days = useMemo(
    () => buildDays({ trip, slots, places, asks, requestedDays, selectedPlaceId }),
    [trip, slots, places, asks, requestedDays, selectedPlaceId],
  );
  const placeCount = days.reduce((n, d) => n + d.filled, 0);
  const favoriteImages = useMemo(() => {
    const favorites = travelers.find((t) => t.role === "client")?.favorites ?? [];
    return new Map(favorites.flatMap((f) => (f.entityId && f.imageUrl ? [[f.entityId, f.imageUrl] as const] : [])));
  }, [travelers]);
  const review = useMemo(
    () => (reviewOpen ? shareReview({ clientName: trip.clientName, days, slots, places }) : null),
    [reviewOpen, trip.clientName, days, slots, places],
  );
  const travelerView = useMemo(
    () => (traveler ? travelerViewFromSnapshot({ trip, travelers, places: Object.values(places), asks: [], slots }, advisorName) : null),
    [traveler, trip, travelers, places, slots, advisorName],
  );
  const switcherImage = days.flatMap((d) => d.slots).find((s) => s.card?.imageUrl)?.card?.imageUrl;

  async function share() {
    const stageBefore = trip.stage;
    const created = await link.create();
    if (!created) return;
    setReviewOpen(false);
    setJustShared(true);
    setMovedToShared(stageBefore === "planning");
    setLinkOpen(true);
  }

  const nav = (
    <nav
      aria-label="Trip"
      className={cn(
        "relative z-10 flex shrink-0 items-center gap-2.5 pt-1",
        wide ? "pb-3" : "-mb-7 bg-linear-to-b from-canvas from-60% to-canvas/0 pb-7",
      )}
    >
      <MenuButton />
      <TripSwitcher
        title={`${trip.clientName} · ${trip.destination.name}`}
        subtitle={datesLabel(trip)}
        imageSrc={switcherImage}
        otherTrips={otherTrips}
      />
    </nav>
  );

  return (
    <div className={cn("flex h-dvh gap-5 overflow-hidden bg-canvas py-4 pr-4 pl-7 max-xl:pl-4", wide && "flex-col gap-0")}>
      {wide ? nav : null}

      {/* The chat stays mounted while the panel is wide, so a running turn keeps streaming. */}
      <div className={cn("relative flex min-h-0 min-w-0 basis-[51.5%] flex-col", wide && "hidden")}>
        {wide ? null : nav}
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatColumn
            key={chat.chat.id}
            chatId={chat.chat.id}
            tripId={trip.id}
            initial={chat}
            onPlaces={applyPlaces}
            onPlacesHover={setHighlight}
            onPlaceClick={select}
          />
        </div>
      </div>

      <section
        aria-label="Trip panel"
        className="@container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sheet bg-surface shadow-[0_2px_8px_rgb(22_19_15/0.08),0_0_0_1px_rgb(22_19_15/0.04)]"
      >
        <header className="flex min-h-[71px] shrink-0 items-center justify-between gap-2 border-b border-ink/8 px-4 py-3.5">
          <SegmentedToggle
            variant="panel"
            label="Panel view"
            value={panelView}
            onValueChange={(next) => setView(next)}
            className={cn(traveler && "[&_[aria-checked=true]]:bg-transparent [&_[aria-checked=true]]:font-medium [&_[aria-checked=true]]:text-text-3")}
            options={[
              { value: "itinerary", label: "Itinerary", icon: <List size={15} strokeWidth={2.2} aria-hidden /> },
              { value: "map", label: "Map", icon: <MapIcon size={15} strokeWidth={2} aria-hidden /> },
            ]}
          />
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-pressed={traveler}
              onClick={() => setView(traveler ? "itinerary" : "traveler")}
              className={cn(
                "inline-flex h-[34px] items-center gap-2 rounded-pill px-3 text-ui font-semibold text-ink transition-colors hover:bg-ink/5",
                traveler && "bg-ink text-surface hover:bg-text-4",
              )}
            >
              <Eye size={17} strokeWidth={2} aria-hidden />
              <span className="@max-[640px]:sr-only">Traveler view</span>
            </button>
            {link.url || placeCount > 0 ? (
              <ShareButton
                link={link}
                client={client}
                onReview={() => setReviewOpen(true)}
                open={linkOpen}
                onOpenChange={(open) => {
                  setLinkOpen(open);
                  if (!open) setJustShared(false);
                }}
                justShared={justShared}
                movedToShared={movedToShared}
                onCopied={() => showToast("Link copied")}
              />
            ) : null}
            <button
              type="button"
              onClick={() => (traveler ? setView("itinerary") : setExpanded((e) => !e))}
              aria-label={wide ? "Show the chat" : "Widen the panel"}
              title={wide ? "Show the chat" : "Widen the panel"}
              className="inline-flex size-[38px] items-center justify-center rounded-pill text-ink transition-colors hover:bg-ink/5"
            >
              {wide ? <Minimize2 size={17} strokeWidth={2} aria-hidden /> : <Maximize2 size={17} strokeWidth={2} aria-hidden />}
            </button>
            <span className="ml-1.5">
              <AccountButton />
            </span>
          </div>
        </header>

        <div className={cn("min-h-0 flex-1", panelView === "map" && !traveler ? "overflow-hidden" : "overflow-y-auto")}>
          {travelerView ? (
            <TravelerView view={travelerView} embedded />
          ) : panelView === "map" ? (
            <TripMapPanel actions={actions} favoriteImages={favoriteImages} />
          ) : (
            <ItineraryPanel actions={actions} />
          )}
        </div>

        {review ? (
          <ShareReviewSheet
            review={review}
            busy={link.busy}
            onClose={() => setReviewOpen(false)}
            onPreview={() => {
              setReviewOpen(false);
              setView("traveler");
            }}
            onShare={() => void share()}
            onAdd={(check) => actions.addToSlot(check.place.tripPlaceId, check.day, check.slot)}
            onShowNote={(note, show) => void actions.saveNote({ day: note.day, slot: note.slot, position: note.position }, note.note, show)}
          />
        ) : null}

        {toast ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-50 flex justify-center px-4">
            <Toast key={toast.id} message={toast.message} position="static" />
          </div>
        ) : null}
      </section>
    </div>
  );
}
