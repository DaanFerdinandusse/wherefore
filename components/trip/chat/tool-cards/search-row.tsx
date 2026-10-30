"use client";

import { BedDouble, Bookmark, Check, CircleAlert, Coffee, Landmark, MapPin, Utensils, Wine } from "lucide-react";
import type { DragEvent } from "react";

import { startPlaceDrag } from "@/components/trip/workspace/dnd";
import { FilmImage } from "@/components/ui/film-image";
import type { Category, FindPlacesOutput, TripPlaceCard } from "@/lib/contracts";
import { CATEGORY_NAME, categoryNoun, loosenedCopy, rowTitle } from "@/lib/agent/tools/labels";
import { cn } from "@/lib/ui/cn";

import { toolErrorText } from "../chat-errors";
import { placesByMatch } from "../chat-format";

import { PlaceChips } from "../../place-chips";

import { ErrorRow, type PlaceHandlers } from "./parts";

// The search row of find_places (Paper S2 to S5): "Looking at 5 restaurants
// for Friday dinner · seafood, lively · 3 of 5" with photo tiles filling in
// (skeletons while pending, a "Match" spinner badge while a place has no
// score yet). Done, it collapses to "Looked at 5 restaurants ..." and a row
// of compact chips; the ask's pick is marked "92 · Picked". Tiles and chips
// switch the inline place card, highlight their pin on hover and drag into an
// itinerary slot.

const CATEGORY_ICON: Record<Category, typeof Utensils> = {
  eat: Utensils,
  drink: Wine,
  coffee: Coffee,
  see: Landmark,
  stay: BedDouble,
  other: MapPin,
};

type Props = PlaceHandlers & {
  state: string;
  preliminary: boolean;
  input?: { intent?: string; day_hint?: string; category?: Category; take?: number };
  output?: FindPlacesOutput;
  errorText?: string;
  onRetry?: () => void;
  /** The ask's pick (recommend_place), marked in the done row. */
  pickedId?: string;
  selectedId?: string;
};

function ArcSpinner({ size = 18, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden className="shrink-0 animate-spin motion-reduce:animate-none">
      <circle cx="13" cy="13" r="11" fill="none" className={light ? "stroke-white/30" : "stroke-ink/12"} strokeWidth="2.4" />
      <path d="M13 2a11 11 0 0 1 11 11" fill="none" className={light ? "stroke-glow" : "stroke-amber-dot"} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** "3 of 5" while the picks are being explained, from the tool's own step counts. */
function progressFigure(output: FindPlacesOutput | undefined): string | undefined {
  const explain = output?.steps?.find((s) => s.key === "explain");
  if (explain?.state === "running" && explain.total) return `${explain.done ?? 0} of ${explain.total}`;
  const score = output?.steps?.find((s) => s.key === "score");
  if (score?.state === "running") return "Checking your places";
  return undefined;
}

function dragHandler(tripPlaceId: string) {
  return (event: DragEvent) => startPlaceDrag(event, tripPlaceId);
}

function Tile({ place, scoring, onPlacesHover, onPlaceClick }: { place: TripPlaceCard; scoring: boolean } & PlaceHandlers) {
  return (
    <li className="min-w-[120px] grow basis-0">
      <button
        type="button"
        draggable
        onDragStart={dragHandler(place.tripPlaceId)}
        data-testid="place-tile"
        data-trip-place-id={place.tripPlaceId}
        onMouseEnter={() => onPlacesHover?.(place.tripPlaceId)}
        onFocus={() => onPlacesHover?.(place.tripPlaceId)}
        onBlur={() => onPlacesHover?.(null)}
        onClick={() => onPlaceClick?.(place.tripPlaceId)}
        className="group rise-in flex w-full flex-col gap-2 text-left outline-none"
      >
        <span className="relative block h-42 w-full overflow-hidden rounded-row bg-avatar transition-shadow group-hover:glow-ring group-focus-visible:glow-ring">
          {place.imageUrl ? (
            <FilmImage src={place.imageUrl} alt="" sizes="150px" unoptimized />
          ) : (
            <span aria-hidden className="absolute inset-0 flex items-center justify-center font-display text-card-sm text-text-2">
              {place.name[0]}
            </span>
          )}
          {place.score !== undefined ? (
            <span className="absolute top-1.5 left-1.5 rounded-pill bg-photo-chip px-1.75 py-0.75 text-meta leading-3.5 font-bold text-white">
              {place.score}
              <span className="sr-only"> match</span>
            </span>
          ) : scoring ? (
            <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-pill bg-photo-chip py-0.75 pr-1.75 pl-1.25 text-meta leading-3.5 font-semibold text-white">
              <ArcSpinner size={12} light />
              Match
            </span>
          ) : null}
          <PlaceChips place={place} variant="tile" />
          {place.yourPlace ? (
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-pill bg-photo-chip px-2 py-0.75 text-meta leading-3.5 font-semibold text-white">
              <Bookmark aria-hidden className="size-2.5 fill-white" strokeWidth={0} />
              Your place
            </span>
          ) : null}
        </span>
        <span className="flex flex-col gap-0.5 px-0.5">
          <span className="truncate text-ui leading-4.5 font-semibold text-ink">{place.name}</span>
          <span className="truncate text-ui-sm leading-4.25 text-text-2">{place.neighborhood ?? CATEGORY_NAME[place.category]}</span>
        </span>
      </button>
    </li>
  );
}

function SkeletonTile({ index }: { index: number }) {
  return (
    <li aria-hidden className="flex min-w-[120px] grow basis-0 flex-col gap-2.5" data-testid="place-tile-skeleton">
      <span className="skeleton-sheen block h-42 rounded-row" style={{ opacity: 1 - index * 0.08 }} />
      <span className="h-3 w-[72%] rounded-pill bg-skeleton" />
      <span className="h-2.5 w-[44%] rounded-pill bg-ink/7" />
    </li>
  );
}

function Chip({ place, picked, selected, onPlacesHover, onPlaceClick }: { place: TripPlaceCard; picked: boolean; selected: boolean } & PlaceHandlers) {
  const line = [place.score !== undefined ? String(place.score) : null, picked ? "Picked" : place.yourPlace ? "Your place" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="min-w-[128px] grow basis-0">
      <button
        type="button"
        draggable
        onDragStart={dragHandler(place.tripPlaceId)}
        data-testid="place-chip"
        data-trip-place-id={place.tripPlaceId}
        data-picked={picked ? "true" : "false"}
        aria-pressed={selected}
        onMouseEnter={() => onPlacesHover?.(place.tripPlaceId)}
        onFocus={() => onPlacesHover?.(place.tripPlaceId)}
        onBlur={() => onPlacesHover?.(null)}
        onClick={() => onPlaceClick?.(place.tripPlaceId)}
        className={cn(
          "flex h-full w-full items-center gap-2 rounded-row p-1.25 text-left transition-colors",
          selected ? "bg-why ring-[1.5px] ring-amber-dot" : "bg-surface-raised ring-1 ring-ink/6 hover:bg-white",
        )}
      >
        <span className="relative size-10 shrink-0 overflow-hidden rounded-[10px] bg-avatar">
          {place.imageUrl ? (
            <FilmImage src={place.imageUrl} alt="" sizes="40px" unoptimized />
          ) : (
            <span aria-hidden className="absolute inset-0 flex items-center justify-center font-display text-lg leading-5 text-text-2">
              {place.name[0]}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-ui-sm leading-4.25 font-semibold text-ink">{place.name}</span>
          {line ? <span className={cn("truncate text-meta", picked ? "font-semibold text-amber" : "text-text-2")}>{line}</span> : null}
          <PlaceChips place={place} variant="row" />
        </span>
      </button>
    </li>
  );
}

export function SearchRow({ state, preliminary, input, output, errorText, onRetry, pickedId, selectedId, ...handlers }: Props) {
  const failed = state === "output-error" || Boolean(output?.error && output.phase === "done" && output.places.length === 0);
  const running = !failed && (state !== "output-available" || preliminary);
  const places = placesByMatch(output?.places ?? []);
  const take = output?.take ?? input?.take ?? 5;
  const category = input?.category;
  const Icon = (category && CATEGORY_ICON[category]) || MapPin;
  const title = failed
    ? `Could not look for ${categoryNoun(category, 2)}`
    : (output?.title ?? rowTitle({ phase: running ? "pending" : "done", count: places.length, category, dayHint: input?.day_hint }));
  const detail = output?.terms?.join(", ") ?? output?.details;
  const figure = running ? progressFigure(output) : undefined;
  const scoring = running && output?.phase !== "done";
  const notes = [...loosenedCopy(output?.loosened ?? [], output?.openDay), ...(!running && output?.progress ? [output.progress] : [])];

  return (
    <div
      className="flex flex-col gap-2.5"
      data-testid="search-row"
      data-tool="find_places"
      data-state={state}
      data-preliminary={preliminary ? "true" : "false"}
      data-running={running ? "true" : "false"}
    >
      <div className="flex items-center gap-2.5 px-1">
        {running ? (
          <ArcSpinner />
        ) : failed ? (
          <CircleAlert aria-hidden className="size-4.5 shrink-0 text-amber" strokeWidth={2} />
        ) : (
          <span className="flex size-4.5 shrink-0 items-center justify-center rounded-pill bg-ink">
            <Check aria-hidden className="size-2.5 text-white" strokeWidth={3.2} />
          </span>
        )}
        <Icon aria-hidden className="size-4 shrink-0 text-ink" strokeWidth={2} />
        <p className={cn("min-w-0 truncate font-semibold text-ink", running ? "text-body-lg leading-5.25" : "text-body leading-5")} data-testid="tool-card-title">
          {title}
        </p>
        {detail ? <p className="min-w-0 grow truncate text-ui leading-4.75 text-text-2">{detail}</p> : <span className="grow" />}
        {figure ? <p className="shrink-0 text-ui font-medium text-amber">{figure}</p> : null}
      </div>

      {failed ? (
        <div className="px-1">
          <ErrorRow message={output?.error ?? toolErrorText(errorText)} onRetry={onRetry} />
        </div>
      ) : running ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" data-testid="search-tiles" onMouseLeave={() => handlers.onPlacesHover?.(null)}>
          {places.map((place) => (
            <Tile key={place.tripPlaceId} place={place} scoring={scoring} {...handlers} />
          ))}
          {Array.from({ length: Math.max(0, Math.min(take, 8) - places.length) }, (_, i) => (
            <SkeletonTile key={`skeleton-${i}`} index={i} />
          ))}
        </ul>
      ) : places.length > 0 ? (
        <ul className="flex gap-1.5 overflow-x-auto p-1" data-testid="search-chips" onMouseLeave={() => handlers.onPlacesHover?.(null)}>
          {places.map((place) => (
            <Chip key={place.tripPlaceId} place={place} picked={place.tripPlaceId === pickedId} selected={place.tripPlaceId === selectedId} {...handlers} />
          ))}
        </ul>
      ) : null}

      {notes.length > 0 && !failed ? (
        <ul className="flex flex-col gap-0.5 px-1">
          {notes.map((note) => (
            <li key={note} className="text-meta text-text-2">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
