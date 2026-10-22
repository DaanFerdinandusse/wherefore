"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import { Ellipsis } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { FilmImage } from "@/components/ui/film-image";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import type { TripStage } from "@/lib/contracts";
import type { TripCard as TripCardData } from "@/lib/trips/contracts";
import { cn } from "@/lib/ui/cn";

import { STAGE_COLUMNS } from "./columns";
import { cardDatesLabel, cardStatus } from "./format";

// One trip on the board: the destination photo (the trip's best scored place,
// or the city's name on a warm surface before there is one), the client, the
// city, the dates and one status line. The whole card opens the trip; it
// drags to another column, and the menu offers the same move from the
// keyboard, plus "Reset to computed stage" once the stage was set by hand.
// The photo goes through FilmImage and its image policy; cards on screen
// load it eagerly so the board does not sit on empty frames.
export function TripCard({
  card,
  today,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onResetStage,
  eager = false,
}: {
  card: TripCardData;
  today: string;
  dragging: boolean;
  onDragStart: (tripId: string) => void;
  onDragEnd: () => void;
  onMove: (tripId: string, stage: TripStage) => void;
  onResetStage: (tripId: string) => void;
  /** Load the photo right away (cards in the first screen). */
  eager?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = cardStatus(card, today);
  const href = `/trips/${card.id}`;

  function handleDragStart(event: DragEvent<HTMLElement>) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.id);
    onDragStart(card.id);
  }

  return (
    <article
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      aria-label={card.title}
      className={cn(
        "group relative flex cursor-grab flex-col rounded-[22px] bg-surface shadow-xs transition-shadow hover:shadow-card active:cursor-grabbing",
        dragging && "opacity-50",
      )}
    >
      {card.imageUrl ? (
        <div className="relative h-[132px] shrink-0 overflow-hidden rounded-t-[22px] bg-avatar">
          <FilmImage src={card.imageUrl} alt="" sizes="334px" loading={eager ? "eager" : undefined} draggable={false} />
        </div>
      ) : (
        <div
          aria-hidden
          className="flex h-[132px] shrink-0 items-end overflow-hidden rounded-t-[22px] bg-surface-raised px-4 pb-3 shadow-[inset_0_-1px_0_var(--color-rule)]"
        >
          <span className="truncate font-display text-section text-text-2">{card.destination.name}</span>
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <div className="flex items-center gap-2">
          <Avatar name={card.clientName} size={26} />
          <span className="truncate text-ui font-semibold text-ink">{card.clientName}</span>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 truncate text-card-sm leading-[30px] font-light tracking-[-0.02em] text-ink">
            <Link
              href={href}
              draggable={false}
              className="after:absolute after:inset-0 after:rounded-[22px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-glow"
            >
              {card.destination.name}
            </Link>
          </h3>
          <span className="shrink-0 text-ui-sm leading-4 text-text-muted">{cardDatesLabel(card)}</span>
        </div>

        <div className="flex min-h-4 items-center gap-2.5">
          {status.progress !== null ? (
            <span aria-hidden className="flex h-1.5 flex-1 overflow-hidden rounded-pill bg-ink/12">
              <span
                className={cn("h-full rounded-pill", status.barTone === "green" ? "bg-green" : "bg-ink")}
                style={{ width: `${Math.round(status.progress * 100)}%` }}
              />
            </span>
          ) : null}
          <span
            className={cn(
              "text-ui-sm leading-4",
              status.tone === "warning" && "font-semibold text-amber",
              status.tone === "strong" && "font-semibold text-ink",
              status.tone === "plain" && "text-text-3",
            )}
          >
            {status.text}
          </span>
        </div>
      </div>

      <div className="absolute top-3 right-3 z-10">
        <Menu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          label={`Actions for ${card.title}`}
          align="end"
          panelClassName="w-[240px]"
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={`Actions for ${card.title}`}
              title="Actions"
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-pill bg-surface/85 text-ink opacity-0 transition hover:bg-surface group-focus-within:opacity-100 group-hover:opacity-100",
                menuOpen && "opacity-100",
              )}
            >
              <Ellipsis size={16} strokeWidth={2} aria-hidden />
            </button>
          )}
        >
          <MenuItem title="Open trip" href={href} onSelect={() => setMenuOpen(false)} />
          {card.stageOverride ? (
            <MenuItem
              title="Reset to computed stage"
              onSelect={() => {
                setMenuOpen(false);
                onResetStage(card.id);
              }}
            />
          ) : null}
          <MenuSeparator />
          <MenuLabel>Move to</MenuLabel>
          {STAGE_COLUMNS.filter((c) => c.stage !== card.stage).map((column) => (
            <MenuItem
              key={column.stage}
              title={column.label}
              onSelect={() => {
                setMenuOpen(false);
                onMove(card.id, column.stage);
              }}
            />
          ))}
        </Menu>
      </div>
    </article>
  );
}
