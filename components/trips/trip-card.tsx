"use client";

import Link from "next/link";
import type { DragEvent, ReactNode } from "react";

import { FilmImage } from "@/components/ui/film-image";
import type { TripStage } from "@/lib/contracts";
import type { TripCard as TripCardData } from "@/lib/trips/contracts";
import { cn } from "@/lib/ui/cn";

import { cardDatesLabel, doneRowLabel } from "./format";
import { cardStatus, needsFavorites } from "./status";
import { DatesMeta, StatusMeta } from "./status-line";
import { TripActionsMenu } from "./trip-actions-menu";

// One trip on the board. A big card for trips in progress: the city photo
// (the trip's best scored place; no photo before there is one), the city in
// Bodoni with the client on the right, then the dates and one status line.
// A trip for a client without favorites is a dashed card without a photo.
// Done trips are compact rows: a thumbnail, the city, "Elena Costa, Sep".
// The whole card opens the trip; it drags to another column, and the "..."
// menu offers the same move from the keyboard.

export type TripCardProps = {
  card: TripCardData;
  today: string;
  now: Date;
  dragging: boolean;
  onDragStart: (tripId: string) => void;
  onDragEnd: () => void;
  onMove: (tripId: string, stage: TripStage) => void;
  onResetStage: (tripId: string) => void;
  /** Load the photo right away (cards in the first screen). */
  eager?: boolean;
};

const CARD_SHADOW = "shadow-[0_1px_3px_rgb(22_19_15/0.06),0_0_0_1px_rgb(22_19_15/0.04)]";
const LIVE_SHADOW =
  "shadow-[0_1px_3px_rgb(22_19_15/0.06),0_0_0_1px_rgb(22_19_15/0.04),0_0_0_2px_rgb(91_102_80/0.4)]";

/** The link that makes the whole card clickable, under the menu button. */
function CardLink({ href, radius, children }: { href: string; radius: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      draggable={false}
      className={cn(
        "after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-glow",
        radius,
      )}
    >
      {children}
    </Link>
  );
}

function useDrag(card: TripCardData, onDragStart: (id: string) => void) {
  return (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.id);
    onDragStart(card.id);
  };
}

export function TripCard(props: TripCardProps) {
  if (props.card.stage === "done") return <DoneRow {...props} />;
  return <ProgressCard {...props} />;
}

function ProgressCard({
  card,
  today,
  now,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onResetStage,
  eager = false,
}: TripCardProps) {
  const status = cardStatus(card, today, now);
  const dashed = needsFavorites(card);
  const photo = !dashed && card.imageUrl;
  const href = `/trips/${card.id}`;
  const handleDragStart = useDrag(card, onDragStart);

  return (
    <article
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      aria-label={card.title}
      className={cn(
        "group relative flex cursor-grab flex-col rounded-[18px] transition-[box-shadow,opacity] active:cursor-grabbing",
        dashed
          ? "border-[1.5px] border-dashed border-ink/20 hover:border-ink/35"
          : cn("bg-surface-raised hover:shadow-card", card.stage === "traveling" ? LIVE_SHADOW : CARD_SHADOW),
        dragging && "opacity-50",
      )}
    >
      {photo ? (
        <div className="relative aspect-[3/2] shrink-0 overflow-hidden rounded-t-[18px] bg-avatar">
          <FilmImage src={photo} alt="" sizes="340px" loading={eager ? "eager" : undefined} draggable={false} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 px-3.5 pt-3 pb-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 truncate font-display text-city text-ink">
            <CardLink href={href} radius="after:rounded-[18px]">
              {card.destination.name}
            </CardLink>
          </h3>
          <span className="min-w-0 max-w-[55%] shrink-0 truncate text-ui-sm font-semibold text-text-3">
            {card.clientName}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <DatesMeta label={cardDatesLabel(card)} />
          <StatusMeta status={status} />
        </div>
      </div>

      <TripActionsMenu
        card={card}
        onMove={onMove}
        onResetStage={onResetStage}
        className="absolute top-2.5 right-2.5 z-10"
      />
    </article>
  );
}

function DoneRow({ card, today, dragging, onDragStart, onDragEnd, onMove, onResetStage }: TripCardProps) {
  const href = `/trips/${card.id}`;
  const handleDragStart = useDrag(card, onDragStart);
  return (
    <article
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      aria-label={card.title}
      className={cn(
        "group relative flex cursor-grab items-center gap-3 rounded-[16px] bg-surface-raised/70 py-2 pr-3.5 pl-2 transition-colors hover:bg-surface-raised active:cursor-grabbing",
        dragging && "opacity-50",
      )}
    >
      <div className="relative h-11 w-[66px] shrink-0 overflow-hidden rounded-[10px] bg-avatar">
        {card.imageUrl ? <FilmImage src={card.imageUrl} alt="" sizes="66px" draggable={false} /> : null}
      </div>
      <h3 className="max-w-[60%] shrink-0 truncate font-display text-city-sm text-ink">
        <CardLink href={href} radius="after:rounded-[16px]">
          {card.destination.name}
        </CardLink>
      </h3>
      <span className="ml-auto min-w-0 shrink-[4] truncate text-right text-ui-sm text-text-2 group-focus-within:invisible group-hover:invisible">
        {doneRowLabel(card, today)}
      </span>
      <TripActionsMenu
        card={card}
        onMove={onMove}
        onResetStage={onResetStage}
        className="absolute top-1/2 right-2.5 z-10 -translate-y-1/2"
      />
    </article>
  );
}
