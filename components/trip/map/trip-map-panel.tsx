"use client";

import { useMemo, useState } from "react";
import { Heart, MessageCircle, Plus } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { Spinner } from "@/components/ui/spinner";
import type { TripPlaceCard } from "@/lib/contracts";
import { favoriteDrivers } from "@/lib/qloo/normalize";
import { cn } from "@/lib/ui/cn";

import { buildDays, firstName } from "../itinerary-view/itinerary-model";
import { useTripStore } from "../store";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

import { dayChips, mapPlaces, mapSuggestion, suggestionTitle, topKeyword, type DayFilter } from "./map-panel-model";
import { TripMap } from "./trip-map";

// The trip panel's map (G2): day chips over the map, the itinerary's places
// as photo pins numbered by their day, the selected place glowing,
// and a card at the bottom for a place the chat suggested for an open slot
// ("Suggested for Day 2 lunch", "+ Add to Day 2"). A pin opens its place in
// a modal (store.select); the map shows no preview card of its own.

export function TripMapPanel({ actions, favoriteImages }: { actions: WorkspaceActions; favoriteImages: Map<string, string> }) {
  const trip = useTripStore((s) => s.trip);
  const places = useTripStore((s) => s.places);
  const asks = useTripStore((s) => s.asks);
  const slots = useTripStore((s) => s.slots);
  const requestedDays = useTripStore((s) => s.requestedDays);
  const selectedPlaceId = useTripStore((s) => s.selectedPlaceId);
  const highlightedPlaceId = useTripStore((s) => s.highlightedPlaceId);
  const camera = useTripStore((s) => s.camera);
  const select = useTripStore((s) => s.select);
  const setHighlight = useTripStore((s) => s.setHighlight);
  const setCamera = useTripStore((s) => s.setCamera);

  const [filter, setFilter] = useState<DayFilter>("all");
  const days = useMemo(
    () => buildDays({ trip, slots, places, asks, requestedDays, selectedPlaceId }),
    [trip, slots, places, asks, requestedDays, selectedPlaceId],
  );
  const selected = selectedPlaceId ? places[selectedPlaceId] : undefined;
  const pinned = useMemo(() => mapPlaces(days, filter, selected), [days, filter, selected]);
  const suggestion = mapSuggestion(days, filter, selectedPlaceId);

  return (
    <div className="relative h-full min-h-0">
      <TripMap
        trip={trip}
        places={pinned}
        asks={[]}
        slots={slots}
        activeTab="all"
        activeAskPlaceIds={[]}
        highlightedPlaceId={highlightedPlaceId}
        selectedPlaceId={selectedPlaceId}
        camera={camera}
        onHover={setHighlight}
        onSelect={select}
        onOpenProfile={select}
        onCameraChange={setCamera}
        pinStyle="itinerary"
        preview={false}
        insets={{ top: 56, bottom: suggestion ? 130 : 0 }}
        className="h-full min-h-0! rounded-none! border-0!"
      />

      <div
        role="radiogroup"
        aria-label="Show days"
        className="absolute top-5 left-6 z-30 flex max-w-[calc(100%-120px)] gap-1.5 overflow-x-auto rounded-pill bg-surface/90 p-1 shadow-[0_4px_12px_rgb(22_19_15/0.1)] backdrop-blur-[12px]"
      >
        {dayChips(days).map((chip) => {
          const on = chip.value === filter;
          return (
            <button
              key={String(chip.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFilter(chip.value)}
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

      {suggestion ? (
        <SuggestionCard
          key={`${suggestion.day}-${suggestion.slot}-${suggestion.suggestion.tripPlaceId}`}
          place={suggestion.suggestion}
          title={suggestionTitle(suggestion)}
          day={suggestion.day}
          clientName={trip.clientName}
          favoriteImages={favoriteImages}
          onOpen={() => select(suggestion.suggestion.tripPlaceId)}
          onAdd={() => actions.addToSlot(suggestion.suggestion.tripPlaceId, suggestion.day, suggestion.slot, suggestion.position)}
        />
      ) : null}
    </div>
  );
}

function SuggestionCard({
  place,
  title,
  day,
  clientName,
  favoriteImages,
  onOpen,
  onAdd,
}: {
  place: TripPlaceCard;
  title: string;
  day: number;
  clientName: string;
  favoriteImages: Map<string, string>;
  onOpen: () => void;
  onAdd: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const keyword = topKeyword(place);
  const driver = [...favoriteDrivers(place.because)].sort((a, b) => b.share - a.share)[0];
  const driverImage = driver ? favoriteImages.get(driver.entityId) : undefined;
  return (
    <div className="rise-in absolute inset-x-5 bottom-5 z-30 flex items-center gap-4 rounded-menu border border-white/60 bg-surface-raised/95 p-3 shadow-[0_16px_40px_rgb(22_19_15/0.15),0_1px_3px_rgb(22_19_15/0.06)] backdrop-blur-[20px] max-sm:flex-wrap">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${place.name} details`}
        className="relative h-[84px] w-[126px] shrink-0 overflow-hidden rounded-[16px] bg-avatar"
      >
        {place.imageUrl ? <FilmImage src={place.imageUrl} alt="" sizes="126px" /> : null}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="label-caps truncate font-semibold tracking-[0.12em] text-amber">{title}</p>
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
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onAdd();
          setBusy(false);
        }}
        className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-ink px-[18px] py-3 text-ui font-semibold text-surface transition-colors hover:bg-text-4 disabled:cursor-progress"
      >
        {busy ? <Spinner size={14} /> : <Plus size={14} strokeWidth={2.4} aria-hidden />}
        Add to Day {day}
      </button>
    </div>
  );
}
