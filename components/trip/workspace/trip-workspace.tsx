"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Map as MapIcon } from "lucide-react";

import { ShareButton } from "@/components/share";
import { TripTopBar, type TripSwitcherItem, type TripView as TopBarView } from "@/components/shell/trip-top-bar";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Toast } from "@/components/ui/toast";
import type { ChatSnapshot, TripSnapshot } from "@/lib/contracts";

import { DiscoverBoard } from "../board/discover-board";
import type { TripView } from "../contracts";
import { HowWeGotThis } from "../how-we-got-this/how-we-got-this";
import { ItineraryView } from "../itinerary-view/itinerary-view";
import { ItineraryRail } from "../rail/itinerary-rail";
import { ChatDockSlot, PlaceProfileSlot, TripMapSlot } from "../slots";
import { TripStoreProvider, useTripStore, useTripStoreApi } from "../store";
import { TravelerView, travelerViewFromSnapshot } from "../traveler-view";

import { datesLabel, firstName } from "./format";
import { activeAskPlaceIds, boardPlaces, liveAsks } from "./reducer";
import type { UrlState } from "./url-state";
import { useSeed } from "./use-seed";
import { useWorkspaceActions } from "./use-workspace-actions";

// The trip workspace: the composition root of /trips/[tripId]. It hydrates
// the store from the server snapshot, renders the top bar, the board or map
// with the itinerary rail, the itinerary view, the traveler view, and plugs
// the map, the place profile and the chat dock in through slots.tsx.

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

export const FOCUS_COMPOSER_EVENT = "tastebrief:focus-composer";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function WorkspaceShell({
  chat,
  otherTrips,
  userName,
  advisorName,
  shareUrl,
  shareToken,
}: Omit<TripWorkspaceProps, "snapshot" | "url"> & { shareToken: string | null }) {
  const router = useRouter();
  const store = useTripStoreApi();
  const actions = useWorkspaceActions();
  const { retry } = useSeed(chat.chat, actions);

  const trip = useTripStore((s) => s.trip);
  const view = useTripStore((s) => s.view);
  const places = useTripStore((s) => s.places);
  const asks = useTripStore((s) => s.asks);
  const slots = useTripStore((s) => s.slots);
  const activeTab = useTripStore((s) => s.activeTab);
  const highlightedPlaceId = useTripStore((s) => s.highlightedPlaceId);
  const selectedPlaceId = useTripStore((s) => s.selectedPlaceId);
  const camera = useTripStore((s) => s.camera);
  const toast = useTripStore((s) => s.toast);
  const { setView, setHighlight, select, setCamera, applyPlaces, dismissToast } = store.getState();

  const [drawerOpen, setDrawerOpen] = useState(false);

  // The share token follows the server: ShareButton refreshes the route
  // after it creates or stops a link, and the page passes the new token.
  useEffect(() => {
    if ((store.getState().trip.shareToken ?? null) !== shareToken) store.getState().setShareToken(shareToken);
  }, [shareToken, store]);
  // The Discover tab returns to the last of board or map.
  const lastDiscover = useRef<"board" | "map">(view === "map" ? "map" : "board");
  useEffect(() => {
    if (view === "board" || view === "map") lastDiscover.current = view;
  }, [view]);

  const mapPlaces = useMemo(() => boardPlaces({ places }), [places]);
  const askList = useMemo(() => liveAsks({ asks }), [asks]);
  const askPlaceIds = useMemo(() => activeAskPlaceIds({ places, activeTab }), [places, activeTab]);
  const selectedCard = selectedPlaceId ? places[selectedPlaceId] : undefined;
  const topImage = mapPlaces.find((p) => p.imageUrl)?.imageUrl;

  // Toasts leave on their own.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismissToast, 4000);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  // Keyboard: Esc closes the drawer, then the profile; "/" focuses the dock's composer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        if (drawerOpen) setDrawerOpen(false);
        else if (store.getState().selectedPlaceId) select(null);
        else if (store.getState().highlightedPlaceId) setHighlight(null);
        return;
      }
      if (event.key === "/" && !isTyping(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, store, select, setHighlight]);

  const topBarView: TopBarView = view === "itinerary" ? "itinerary" : view === "traveler" ? "traveler" : "discover";
  const onViewChange = (next: TopBarView) => setView(next === "discover" ? lastDiscover.current : (next as TripView));

  const toggle =
    view === "board" || view === "map" ? (
      <SegmentedToggle
        variant="glass"
        label="Board or map"
        value={view}
        onValueChange={(v) => setView(v)}
        options={[
          { value: "board", label: "Board", icon: <LayoutGrid size={16} strokeWidth={2} aria-hidden /> },
          { value: "map", label: "Map", icon: <MapIcon size={16} strokeWidth={2} aria-hidden /> },
        ]}
      />
    ) : undefined;

  const dock = (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-6">
      <div className="pointer-events-auto relative w-[920px] max-w-full">
        <ChatDockSlot
          chatId={trip.chatId}
          tripId={trip.id}
          initial={chat}
          onPlaces={applyPlaces}
          onPlacesHover={setHighlight}
          onPlaceClick={select}
          toggle={toggle}
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <TripTopBar
        trip={{ title: `${trip.clientName} · ${trip.destination.name}`, datesLabel: datesLabel(trip), imageSrc: topImage }}
        otherTrips={otherTrips}
        view={topBarView}
        onViewChange={onViewChange}
        onHowWeGotThis={() => setDrawerOpen(true)}
        share={<ShareButton tripId={trip.id} shareUrl={shareUrl} />}
        userName={userName}
        onSignOut={async () => {
          await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
          router.push("/sign-in");
          router.refresh();
        }}
      />

      <main className="flex min-h-0 flex-1">
        {view === "board" || view === "map" ? (
          <>
            <div className="relative flex min-w-0 flex-1 flex-col">
              {view === "board" ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-1 pb-[260px]">
                  <DiscoverBoard actions={actions} onRetrySeed={retry} />
                </div>
              ) : (
                <div className="min-h-0 flex-1 px-7 pt-1 pb-6">
                  <TripMapSlot
                    trip={trip}
                    places={mapPlaces}
                    asks={askList}
                    slots={slots}
                    activeTab={activeTab}
                    activeAskPlaceIds={askPlaceIds}
                    pendingPlaceholder={null}
                    highlightedPlaceId={highlightedPlaceId}
                    selectedPlaceId={selectedPlaceId}
                    camera={camera}
                    onHover={setHighlight}
                    onSelect={select}
                    onOpenProfile={select}
                    onCameraChange={setCamera}
                    className="h-full rounded-card"
                  />
                </div>
              )}
              {dock}
            </div>
            <div className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-rule-strong py-6 pr-5.5 pl-7 lg:block">
              <ItineraryRail actions={actions} />
            </div>
          </>
        ) : view === "itinerary" ? (
          <div className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
            <ItineraryView actions={actions} />
            {dock}
          </div>
        ) : (
          <TravelerPreview advisorName={advisorName} shareUrl={shareUrl} />
        )}
      </main>

      {selectedCard ? (
        <PlaceProfileSlot
          trip={trip}
          card={selectedCard}
          clientName={trip.clientName}
          slots={slots}
          open
          onClose={() => select(null)}
          onAddToSlot={async (id, day, slot) => {
            // The toast says why; the throw keeps the sheet from reading it as done.
            if (!(await actions.addToSlot(id, day, slot))) throw new Error("The itinerary did not update.");
          }}
          onRemove={async (id, replace) => {
            if (replace) return actions.replacePlace(id);
            select(null);
            await actions.removePlace(id);
          }}
          onToggleMyPlace={(id, saved) => actions.toggleMyPlace(id, saved)}
          onEditNote={(advisorPlaceId, note) => actions.editMyPlaceNote(advisorPlaceId, note)}
        />
      ) : null}

      <HowWeGotThis tripId={trip.id} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {toast ? <Toast key={toast.id} message={toast.message} className="bottom-[220px]!" /> : null}
    </div>
  );
}

/**
 * The "Traveler view" tab: what the shared page shows, rendered with the same
 * projection over the live store (so it follows every edit), with the share
 * control above it.
 */
function TravelerPreview({ advisorName, shareUrl }: { advisorName: string | null; shareUrl?: string }) {
  const trip = useTripStore((s) => s.trip);
  const travelers = useTripStore((s) => s.travelers);
  const places = useTripStore((s) => s.places);
  const slots = useTripStore((s) => s.slots);
  const view = useMemo(
    () => travelerViewFromSnapshot({ trip, travelers, places: Object.values(places), asks: [], slots }, advisorName),
    [trip, travelers, places, slots, advisorName],
  );
  const client = firstName(trip.clientName);
  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule px-7 py-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-card-sm leading-8 text-ink">What {client} will see</h1>
          <p className="text-ui-sm text-text-muted">
            {shareUrl
              ? `The link is live: ${client} sees these days, the notes you mark for the traveler and why each place fits.`
              : `Share the itinerary to send ${client} this page. Only notes you mark for the traveler show.`}
          </p>
        </div>
        <ShareButton tripId={trip.id} shareUrl={shareUrl} />
      </div>
      <TravelerView view={view} embedded />
    </div>
  );
}
