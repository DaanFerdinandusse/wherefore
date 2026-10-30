"use client";

import { BedDouble, Check, CircleAlert, Coffee, Landmark, MapPin, Utensils, Wine } from "lucide-react";
import type { DragEvent } from "react";

import { startPlaceDrag } from "@/components/trip/workspace/dnd";
import { FilmImage } from "@/components/ui/film-image";
import type { Category, FindPlacesOutput, PlaceVerdict, TripPlaceCard } from "@/lib/contracts";
import { categoryNoun, loosenedCopy, rowTitle } from "@/lib/agent/tools/labels";
import { cn } from "@/lib/ui/cn";

import { toolErrorText } from "../chat-errors";
import { placesByVerdict } from "../chat-format";

import { PlaceChips } from "../../place-chips";

import { ErrorRow, type PlaceHandlers } from "./parts";
import { useFlip } from "./use-flip";
import { VerdictLine } from "../../verdict-line";

// The search row of find_places. While the agent works, the header says what
// it is doing and every place is a row with room for the agent's line:
// rejected places grey out and sink to the back, a second search adds to the
// same list. Done, the rows fold into the row of compact chips, "Looked at 5
// restaurants ...": the pick is marked "92 · Picked", the next best "87 ·
// Backup". The same list element holds both layouts, so each place slides from
// its row into its chip. Rows and chips switch the inline place card, highlight
// their pin on hover and drag into an itinerary slot.

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

function dragHandler(place: TripPlaceCard) {
  return (event: DragEvent) => startPlaceDrag(event, place.tripPlaceId, place.category);
}

function matchLine(place: TripPlaceCard, picked: boolean, backup: boolean): string {
  return [place.score !== undefined ? String(place.score) : null, picked ? "Picked" : backup ? "Backup" : place.yourPlace ? "Your place" : null]
    .filter(Boolean)
    .join(" · ");
}

type ItemProps = PlaceHandlers & {
  place: TripPlaceCard;
  layout: "rows" | "chips";
  verdict?: PlaceVerdict;
  picked: boolean;
  backup: boolean;
  selected: boolean;
};

// One element for both layouts, so it can slide from its row into its chip.
function PlaceItem({ place, layout, verdict, picked, backup, selected, onPlacesHover, onPlaceClick }: ItemProps) {
  const rows = layout === "rows";
  const out = verdict?.stand === "out";
  const line = matchLine(place, picked, backup);
  return (
    <li data-flip-id={place.tripPlaceId} className={rows ? "w-full" : "min-w-[128px] grow basis-0"}>
      <button
        type="button"
        draggable
        onDragStart={dragHandler(place)}
        data-testid={rows ? "place-tile" : "place-chip"}
        data-trip-place-id={place.tripPlaceId}
        data-picked={picked ? "true" : "false"}
        data-stand={verdict?.stand}
        aria-pressed={selected}
        onMouseEnter={() => onPlacesHover?.(place.tripPlaceId)}
        onFocus={() => onPlacesHover?.(place.tripPlaceId)}
        onBlur={() => onPlacesHover?.(null)}
        onClick={() => onPlaceClick?.(place.tripPlaceId)}
        className={cn(
          "group/place rise-in flex h-full w-full items-center text-left transition-colors",
          rows ? "gap-3 rounded-row p-1.5" : "gap-2 rounded-row p-1.25",
          rows
            ? verdict?.stand === "pick"
              ? "bg-why ring-[1.5px] ring-amber-dot"
              : verdict?.stand === "backup"
                ? "bg-surface-raised ring-[1.5px] ring-amber-dot/45"
                : "bg-surface-raised ring-1 ring-ink/6"
            : selected
              ? "bg-why ring-[1.5px] ring-amber-dot"
              : "bg-surface-raised ring-1 ring-ink/6 hover:bg-white",
        )}
      >
        <span
          className={cn(
            "relative shrink-0 overflow-hidden rounded-[10px] bg-avatar transition-[width,height] duration-500 ease-[var(--ease-out-expo)] motion-reduce:transition-none",
            rows ? (out ? "h-9 w-11" : "h-13 w-16") : "size-10",
          )}
        >
          {place.imageUrl ? (
            <FilmImage
              src={place.imageUrl}
              alt=""
              sizes="64px"
              unoptimized
              className={cn(out && !selected && "grayscale transition-[filter] duration-300 group-hover/place:grayscale-0")}
            />
          ) : (
            <span aria-hidden className="absolute inset-0 flex items-center justify-center font-display text-lg leading-5 text-text-2">
              {place.name[0]}
            </span>
          )}
        </span>
        <span className="flex min-w-0 grow flex-col gap-px">
          <span className={cn("truncate font-semibold", rows ? (out ? "text-ui font-medium text-text-2" : "text-body leading-5 text-ink") : cn("text-ui-sm leading-4.25", out && !selected ? "text-text-2" : "text-ink"))}>
            {place.name}
          </span>
          {rows ? (
            verdict ? (
              <VerdictLine verdict={verdict} className={cn("rise-in", out ? "text-ui-sm leading-[17px] text-text-3" : "text-ui leading-[19px] text-text-3")} />
            ) : (
              <span aria-hidden className="skeleton-sheen mt-1 block h-2.5 w-[56%] rounded-pill" />
            )
          ) : (
            <>
              {line ? <span className={cn("truncate text-meta", picked || backup ? "font-semibold text-amber" : "text-text-2")}>{line}</span> : null}
              <PlaceChips place={place} variant="row" />
            </>
          )}
        </span>
      </button>
    </li>
  );
}

function SkeletonRow({ index }: { index: number }) {
  return (
    <li aria-hidden className="flex w-full items-center gap-3 rounded-row bg-surface-raised p-1.5 ring-1 ring-ink/6" data-testid="place-tile-skeleton">
      <span className="skeleton-sheen block h-13 w-16 shrink-0 rounded-[10px]" style={{ opacity: 1 - index * 0.08 }} />
      <span className="flex grow flex-col gap-2">
        <span className="h-3 w-[38%] rounded-pill bg-skeleton" />
        <span className="h-2.5 w-[62%] rounded-pill bg-ink/7" />
      </span>
    </li>
  );
}

export function SearchRow({ state, preliminary, input, output, errorText, onRetry, pickedId, selectedId, ...handlers }: Props) {
  const failed = state === "output-error" || Boolean(output?.error && output.phase === "done" && output.places.length === 0);
  const running = !failed && (state !== "output-available" || preliminary);
  const verdicts = output?.verdicts;
  const places = placesByVerdict(output?.places ?? [], verdicts);
  const pickId = pickedId ?? verdicts?.find((v) => v.stand === "pick")?.tripPlaceId;
  const backupId = verdicts?.find((v) => v.stand === "backup")?.tripPlaceId;
  const take = output?.take ?? input?.take ?? 5;
  const category = input?.category;
  const Icon = (category && CATEGORY_ICON[category]) || MapPin;
  const title = failed
    ? `Could not look for ${categoryNoun(category, 2)}`
    : (output?.title ?? rowTitle({ phase: running ? "pending" : "done", count: places.length, category, dayHint: input?.day_hint }));
  const terms = output?.terms?.join(", ") ?? output?.details;
  const searches = output?.searches ? `${output.searches} searches` : undefined;
  const detail = [terms, running ? undefined : searches].filter(Boolean).join(" · ");
  const figure = running ? progressFigure(output) : undefined;
  const layout = running ? "rows" : "chips";
  const listRef = useFlip<HTMLUListElement>(`${layout}|${places.map((p) => p.tripPlaceId).join(",")}|${(verdicts ?? []).map((v) => v.stand).join(",")}`);
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
          {(running && output?.status) || title}
        </p>
        {detail ? <p className="min-w-0 grow truncate text-ui leading-4.75 text-text-2">{detail}</p> : <span className="grow" />}
        {figure ? <p className="shrink-0 text-ui font-medium text-amber">{figure}</p> : null}
      </div>

      {failed ? (
        <div className="px-1">
          <ErrorRow message={output?.error ?? toolErrorText(errorText)} onRetry={onRetry} />
        </div>
      ) : running || places.length > 0 ? (
        <ul
          ref={listRef}
          className={cn("flex data-flipping:overflow-visible!", running ? "flex-col gap-1.5" : "gap-1.5 overflow-x-auto p-1")}
          data-testid={running ? "search-tiles" : "search-chips"}
          onMouseLeave={() => handlers.onPlacesHover?.(null)}
        >
          {places.map((place) => (
            <PlaceItem
              key={place.tripPlaceId}
              place={place}
              layout={layout}
              verdict={verdicts?.find((v) => v.tripPlaceId === place.tripPlaceId)}
              picked={place.tripPlaceId === pickId}
              backup={place.tripPlaceId === backupId}
              selected={place.tripPlaceId === selectedId}
              {...handlers}
            />
          ))}
          {running
            ? Array.from({ length: Math.max(0, Math.min(take, 8) - places.length) }, (_, i) => <SkeletonRow key={`skeleton-${i}`} index={i} />)
            : null}
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
