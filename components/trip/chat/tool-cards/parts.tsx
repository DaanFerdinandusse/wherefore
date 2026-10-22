"use client";

import { Check, CircleAlert, Minus, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { BookmarkMark } from "@/components/ui/bookmark-mark";
import { FilmImage } from "@/components/ui/film-image";
import { MatchPill } from "@/components/ui/match-pill";
import { Spinner } from "@/components/ui/spinner";
import type { ToolStepState, TripPlaceCard } from "@/lib/contracts";
import { CATEGORY_NAME } from "@/lib/agent/tools/labels";
import { cn } from "@/lib/ui/cn";

// Pieces every tool card shares: the frame, the step icon, a place tile and
// the error row with Retry. Token classes only.

export type PlaceHandlers = {
  /** Trip place id under the pointer, null when it leaves. */
  onPlacesHover?: (tripPlaceId: string | null) => void;
  onPlaceClick?: (tripPlaceId: string) => void;
};

export function CardFrame({
  tool,
  state,
  preliminary,
  children,
  className,
}: {
  tool: string;
  state: string;
  preliminary?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="tool-card"
      data-tool={tool}
      data-state={state}
      data-preliminary={preliminary ? "true" : "false"}
      className={cn("rise-in flex flex-col gap-2 rounded-row border border-rule bg-surface-raised/55 px-3.5 py-3", className)}
    >
      {children}
    </div>
  );
}

/** The 20 px round state mark at the start of a row. */
export function StepIcon({ state, label }: { state: ToolStepState; label?: string }) {
  if (state === "running") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center text-ink">
        <Spinner size={18} label={label ?? "Working"} />
      </span>
    );
  }
  if (state === "done") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-pill bg-ink text-surface">
        <Check aria-hidden className="size-3" strokeWidth={2.5} />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-pill bg-avatar text-amber">
        <CircleAlert aria-hidden className="size-3.5" strokeWidth={2} />
      </span>
    );
  }
  if (state === "skipped") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-pill border border-rule-strong text-text-2">
        <Minus aria-hidden className="size-3" strokeWidth={2} />
      </span>
    );
  }
  return <span aria-hidden className="size-5 shrink-0 rounded-pill border-2 border-rule-strong" />;
}

/** "Wine bar · Príncipe Real" from what the card knows. */
export function typeLine(place: Pick<TripPlaceCard, "category" | "neighborhood">): string {
  return [CATEGORY_NAME[place.category], place.neighborhood].filter(Boolean).join(" · ");
}

/** A 150 px photo tile: score chip, your place mark, name and type line. */
export function PlaceTile({
  place,
  onPlacesHover,
  onPlaceClick,
  className,
}: { place: TripPlaceCard; className?: string } & PlaceHandlers) {
  return (
    <li className={cn("w-[150px] shrink-0", className)}>
      <button
        type="button"
        data-testid="place-tile"
        data-trip-place-id={place.tripPlaceId}
        className="group flex w-full flex-col gap-1.5 rounded-xl text-left outline-none"
        onMouseEnter={() => onPlacesHover?.(place.tripPlaceId)}
        onFocus={() => onPlacesHover?.(place.tripPlaceId)}
        onBlur={() => onPlacesHover?.(null)}
        onClick={() => onPlaceClick?.(place.tripPlaceId)}
      >
        <span
          className={cn(
            "relative flex h-[92px] w-full items-start justify-between overflow-hidden rounded-xl p-1.5 transition-shadow",
            "group-hover:glow-ring group-focus-visible:glow-ring",
            place.imageUrl ? "bg-avatar" : "border-[1.5px] border-dashed border-glow bg-avatar/80",
          )}
        >
          {place.imageUrl ? (
            <FilmImage src={place.imageUrl} alt="" sizes="150px" unoptimized className="-z-0" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-meta font-medium text-amber">No photo</span>
          )}
          {place.score !== undefined ? <MatchPill size="xs" score={place.score} className="relative" /> : <span />}
          {place.yourPlace ? <BookmarkMark size={20} label="Your place" className="relative" /> : null}
        </span>
        <span className="truncate text-ui-sm font-semibold text-ink">{place.name}</span>
        <span className="-mt-1 truncate text-meta text-text-2">{typeLine(place)}</span>
      </button>
    </li>
  );
}

export function ErrorRow({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3" role="alert">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" strokeWidth={1.75} />
      <p className="text-ui-sm text-text-3" data-testid="tool-error">
        {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-pill border border-rule px-2.5 py-1 text-ui-sm text-ink hover:bg-surface"
        >
          <RotateCcw aria-hidden className="size-3" strokeWidth={1.75} />
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** Card header row: state mark, title, details, right-hand figure. */
export function CardHeader({
  state,
  title,
  details,
  figure,
  leading,
}: {
  state: ToolStepState;
  title: string;
  details?: ReactNode;
  figure?: string;
  leading?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <StepIcon state={state} />
      {leading}
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <p className="truncate text-body leading-[19px] font-semibold text-ink" data-testid="tool-card-title">
          {title}
        </p>
        {details ? <p className="truncate text-ui-sm text-text-4">{details}</p> : null}
      </div>
      {figure ? <p className="shrink-0 text-ui-sm font-medium text-ink">{figure}</p> : null}
    </div>
  );
}
