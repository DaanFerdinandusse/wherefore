"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Heart, MessageCircle, Plus } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import type { TripPlaceCard } from "@/lib/contracts";
import { mapRegionPrompt } from "@/lib/map/region-prompt";
import { favoriteDrivers } from "@/lib/qloo/normalize";
import { cn } from "@/lib/ui/cn";

import { buildDays, firstName } from "../itinerary-view/itinerary-model";
import { useTripStore } from "../store";
import { askIdOf, askTab, liveAsks, nextFreeSlot } from "../workspace/reducer";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

import {
  dayChips,
  mapBar,
  mapPlaces,
  mapSearches,
  regionAsk,
  topKeyword,
  type DayFilter,
  type MapBar,
} from "./map-panel-model";
import { SearchTabs } from "./search-tabs";
import { TripMap } from "./trip-map";
import { useElementSize } from "./use-element-size";

// The trip panel's map (G2): day tabs over the map, the itinerary's places
// as photo pins numbered by their day, the picked place glowing, and a bar at
// the bottom about one place: "On Day 2 lunch" for a place in the itinerary,
// "Suggested for Day 2 lunch" with "+ Add to Day 2" for one that is not, and
// Open for its modal. With nothing picked it offers the first suggestion for
// an open slot.
//
// One click on a pin picks it: the bar changes and the map centers on it. A
// double click also opens the modal (store.select). A pick is local, so it
// never opens the modal; the store's selection is the modal.
//
// Adding plays one landing: the button confirms and folds away, the bar warms
// for a moment and says the day, and the pin gets its badge with a ring.
//
// Under the days, the searches from the chat. The map shows one thing at a
// time, so one tab is on across both rows: a day, or a search. A search on
// the map is the store's active tab, which a new search opens by itself and
// the URL keeps. The day filter waits underneath it.
//
// With a search's results on the map, a big move offers "Search this region":
// it asks the chat for the same thing in the circle on screen, and the prompt
// shows up in the chat like a message the advisor typed. A day tab never offers
// it: there is nothing to search again.

/** Space the tabs take at the top of the map: the day tabs, then the search tabs under them. */
const DAY_TABS_INSET = 56;
const ALL_TABS_INSET = 96;
/** The bar's space at the bottom. On a map narrower than `@max-[660px]`, its buttons take a row of their own. */
const BAR_INSET = 130;
const BAR_WRAPPED_INSET = 176;
const BAR_WRAP_WIDTH = 660;
/** How long the landing plays. The Add button folds away in the last part of it. */
const LANDING_MS = 1100;

export function TripMapPanel({
  actions,
  favoriteImages,
}: {
  actions: Pick<WorkspaceActions, "addToSlot">;
  favoriteImages: Map<string, string>;
}) {
  const trip = useTripStore((s) => s.trip);
  const places = useTripStore((s) => s.places);
  const asks = useTripStore((s) => s.asks);
  const slots = useTripStore((s) => s.slots);
  const requestedDays = useTripStore((s) => s.requestedDays);
  const selectedPlaceId = useTripStore((s) => s.selectedPlaceId);
  const highlightedPlaceId = useTripStore((s) => s.highlightedPlaceId);
  const camera = useTripStore((s) => s.camera);
  const activeTab = useTripStore((s) => s.activeTab);
  const select = useTripStore((s) => s.select);
  const setHighlight = useTripStore((s) => s.setHighlight);
  const setCamera = useTripStore((s) => s.setCamera);
  const setTab = useTripStore((s) => s.setTab);
  const askChat = useTripStore((s) => s.askChat);

  const [panelRef, panelSize] = useElementSize<HTMLDivElement>();
  const [filter, setFilter] = useState<DayFilter>("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [landing, setLanding] = useState<{ placeId: string; day: number } | null>(null);
  const days = useMemo(
    () => buildDays({ trip, slots, places, asks, requestedDays, selectedPlaceId }),
    [trip, slots, places, asks, requestedDays, selectedPlaceId],
  );
  const searches = useMemo(() => mapSearches(liveAsks({ asks }), Object.values(places)), [asks, places]);
  const askId = askIdOf(activeTab);
  const search = searches.find((s) => s.id === askId);
  const searchPlaceIds = useMemo(() => search?.places.map((p) => p.tripPlaceId) ?? [], [search]);
  const focusedId = selectedPlaceId ?? pickedId;
  const focused = focusedId ? places[focusedId] : undefined;
  const picked = focused?.status === "removed" ? undefined : focused;
  const pinned = useMemo(() => mapPlaces(days, filter, picked, search), [days, filter, picked, search]);
  const free = picked ? nextFreeSlot({ trip, slots, requestedDays }, picked.category) : null;
  const bar = mapBar(days, filter, picked, search, free);

  useEffect(() => {
    if (!landing) return;
    const timer = window.setTimeout(() => setLanding(null), LANDING_MS);
    return () => window.clearTimeout(timer);
  }, [landing]);

  async function addToDay(add: Extract<MapBar, { kind: "add" }>) {
    // Stays on this place, so the bar can say where it went.
    setPickedId(add.place.tripPlaceId);
    setLanding({ placeId: add.place.tripPlaceId, day: add.day });
    // The landing is the confirmation, so no toast on top of it.
    const saved = await actions.addToSlot(add.place.tripPlaceId, add.day, add.slot, add.position, { quiet: true });
    if (!saved) setLanding(null);
  }

  function pickDay(day: DayFilter) {
    setFilter(day);
    setPickedId(null);
    if (search) setTab("all");
  }

  function pickSearch(id: string) {
    setPickedId(null);
    setTab(id === search?.id ? "all" : askTab(id));
  }

  function pickPin(id: string | null) {
    setPickedId(id);
    if (id === null) select(null);
  }

  return (
    <div ref={panelRef} className="@container relative h-full min-h-0">
      <TripMap
        trip={trip}
        places={pinned}
        asks={[]}
        slots={slots}
        activeTab={search ? askTab(search.id) : "all"}
        activeAskPlaceIds={searchPlaceIds}
        highlightedPlaceId={highlightedPlaceId}
        selectedPlaceId={focusedId}
        camera={camera}
        onHover={setHighlight}
        onSelect={pickPin}
        onOpenProfile={select}
        onPinDoubleClick={select}
        landedPlaceId={landing?.placeId}
        onCameraChange={setCamera}
        onSearchArea={search && !search.running ? (region) => askChat(mapRegionPrompt(region, regionAsk(search))) : undefined}
        pinStyle="itinerary"
        preview={false}
        centerSelection
        // Frames the day picked, and a search again when its last places are in.
        fitScope={search ? String(search.running) : String(filter)}
        insets={{ top: searches.length > 0 ? ALL_TABS_INSET : DAY_TABS_INSET, bottom: bar ? (panelSize.width < BAR_WRAP_WIDTH ? BAR_WRAPPED_INSET : BAR_INSET) : 0 }}
        className="h-full min-h-0! rounded-none! border-0!"
      />

      <div className="absolute top-5 left-6 z-40 flex max-w-[calc(100%-120px)] flex-col items-start gap-1.5">
        <div
          role="radiogroup"
          aria-label="Show days"
          className="flex max-w-full gap-1.5 overflow-x-auto rounded-pill bg-surface/90 p-1 shadow-[0_4px_12px_rgb(22_19_15/0.1)] backdrop-blur-[12px]"
        >
          {dayChips(days).map((chip) => {
            const on = !search && chip.value === filter;
            return (
              <button
                key={String(chip.value)}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickDay(chip.value)}
                className={cn(
                  "shrink-0 rounded-pill py-[7px] text-ui-sm leading-[17px] transition-colors",
                  on ? "bg-ink px-3.5 font-semibold text-surface" : "px-3 font-medium text-ink hover:bg-ink/5",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {searches.length > 0 ? (
          <SearchTabs
            searches={searches}
            activeId={search?.id ?? null}
            height={panelSize.height}
            onPick={pickSearch}
          />
        ) : null}
      </div>

      {bar ? (
        <PlaceBar
          key={bar.place.tripPlaceId}
          bar={bar}
          clientName={trip.clientName}
          favoriteImages={favoriteImages}
          landedDay={landing?.placeId === bar.place.tripPlaceId ? landing.day : null}
          onOpen={() => select(bar.place.tripPlaceId)}
          onAdd={addToDay}
        />
      ) : null}
    </div>
  );
}

function PlaceBar({
  bar,
  clientName,
  favoriteImages,
  landedDay,
  onOpen,
  onAdd,
}: {
  bar: MapBar;
  clientName: string;
  favoriteImages: Map<string, string>;
  /** The day this place was just added to, while the landing plays. */
  landedDay: number | null;
  onOpen: () => void;
  onAdd: (add: Extract<MapBar, { kind: "add" }>) => void;
}) {
  const place: TripPlaceCard = bar.place;
  const landed = landedDay !== null;
  const day = bar.kind === "add" ? bar.day : landedDay;
  const keyword = topKeyword(place);
  const driver = [...favoriteDrivers(place.because)].sort((a, b) => b.share - a.share)[0];
  const driverImage = driver ? favoriteImages.get(driver.entityId) : undefined;
  return (
    <div
      className={cn(
        "rise-in absolute inset-x-5 bottom-5 z-30 flex items-center gap-4 rounded-menu border border-white/60 p-3 shadow-[0_16px_40px_rgb(22_19_15/0.15),0_1px_3px_rgb(22_19_15/0.06)] backdrop-blur-[20px] transition-colors duration-700 @max-[660px]:flex-wrap",
        landed ? "bg-why/95" : "bg-surface-raised/95",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${place.name} details`}
        className="relative h-[84px] w-[126px] shrink-0 overflow-hidden rounded-[16px] bg-avatar @max-[660px]:h-16 @max-[660px]:w-24"
      >
        {place.imageUrl ? <FilmImage src={place.imageUrl} alt="" sizes="126px" /> : null}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p key={bar.kind} className={cn("label-caps flex items-center gap-1.5 font-semibold tracking-[0.12em] text-amber", landed && "rise-in")}>
          {bar.kind === "added" ? <Check size={14} strokeWidth={2.4} aria-hidden className={cn("shrink-0", landed && "check-draw")} /> : null}
          <span className="truncate">{bar.title}</span>
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="truncate text-[17px] leading-[22px] font-semibold text-ink">{place.name}</p>
          {typeof place.score === "number" ? (
            <span className="flex h-[26px] shrink-0 items-center gap-1.5 rounded-pill bg-why py-[3px] pr-[3px] pl-[9px]">
              <Heart size={13} strokeWidth={2.2} aria-hidden className="text-amber" />
              <span className="text-meta font-semibold text-ink">Why {firstName(clientName)}</span>
              <span className={cn("font-display text-body-lg leading-[18px] font-medium text-amber", !driverImage && "pr-1.5")}>
                {Math.round(place.score)}
              </span>
              {driverImage ? (
                <span className="relative size-5 overflow-hidden rounded-pill bg-avatar" title={driver?.name}>
                  <FilmImage src={driverImage} alt="" sizes="20px" />
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        {keyword ? (
          <p className="flex items-center gap-1.5 text-ui-sm leading-4">
            <MessageCircle size={15} strokeWidth={2} aria-hidden className="shrink-0 text-text-2" />
            <span className="font-medium text-ink">{keyword.name}</span>
            <span className="text-text-2">{keyword.mentions}</span>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 @max-[660px]:w-full @max-[660px]:justify-end">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${place.name}`}
          className="inline-flex items-center rounded-pill border border-rule-strong px-[18px] py-3 text-ui font-semibold text-ink transition-colors hover:bg-ink/5"
        >
          Open
        </button>
        {day !== null ? (
          // Folds to nothing once the place is on the day; the delay lets "Added" read first.
          <div
            className={cn(
              "grid transition-[grid-template-columns,opacity] duration-400 ease-out-expo",
              bar.kind === "add" ? "grid-cols-[1fr]" : "grid-cols-[0fr] opacity-0 delay-500",
            )}
          >
            <div className="min-w-0 overflow-hidden">
              <button
                type="button"
                disabled={landed}
                onClick={() => {
                  if (bar.kind === "add") onAdd(bar);
                }}
                className="grid rounded-pill bg-ink px-[18px] py-3 text-ui font-semibold whitespace-nowrap text-surface transition-colors hover:bg-text-4 disabled:hover:bg-ink"
              >
                <span className={cn("col-start-1 row-start-1 inline-flex items-center gap-2 transition-opacity duration-200", landed && "opacity-0")}>
                  <Plus size={14} strokeWidth={2.4} aria-hidden />
                  Add to Day {day}
                </span>
                <span
                  aria-hidden={!landed}
                  className={cn(
                    "col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-opacity duration-200",
                    !landed && "opacity-0",
                  )}
                >
                  {landed ? <Check size={15} strokeWidth={2.6} aria-hidden className="check-draw" /> : null}
                  Added
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
