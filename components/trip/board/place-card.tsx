"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { Ellipsis, Plus } from "lucide-react";

import { BecauseRow } from "@/components/ui/because-row";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { MatchPill } from "@/components/ui/match-pill";
import { Menu, MenuItem } from "@/components/ui/menu";
import { PhotoCard, type PhotoCardSize } from "@/components/ui/photo-card";
import { Popover } from "@/components/ui/popover";
import { NewFromAskBadge, YourPlaceBadge } from "@/components/ui/your-place-badge";
import { YourNoteRow } from "@/components/ui/your-note-row";
import type { ItinerarySlot, SlotName, TripPlaceCard } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { startPlaceDrag } from "../workspace/dnd";
import { becauseLine, firstName, SLOT_LABELS, typeLine } from "../workspace/format";

import { SlotPicker } from "./slot-picker";

// A transparent pixel for a place without a provider image: the card keeps
// its avatar fill and its layout.
export const NO_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export type PlaceCardProps = {
  card: TripPlaceCard;
  clientName: string;
  size: PhotoCardSize;
  /** Arch top: the featured card when it carries the advisor's note. */
  arch?: boolean;
  highlighted: boolean;
  /** "New from your ask" when an ask tab is showing its own results. */
  fromAsk?: boolean;
  nextSlot: { day: number; slot: SlotName } | null;
  picker: { days: number; dates: (string | undefined)[]; slots: ItinerarySlot[]; placeNames: Record<string, string> };
  priority?: boolean;
  className?: string;
  onHover: (tripPlaceId: string | null) => void;
  onOpen: (tripPlaceId: string) => void;
  onAdd: (tripPlaceId: string, day: number, slot: SlotName) => void;
  onRemove: (tripPlaceId: string) => void;
  onKeyNav?: (event: KeyboardEvent<HTMLElement>) => void;
};

export function PlaceCard({
  card,
  clientName,
  size,
  arch = false,
  highlighted,
  fromAsk = false,
  nextSlot,
  picker,
  priority,
  className,
  onHover,
  onOpen,
  onAdd,
  onRemove,
  onKeyNav,
}: PlaceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const because = becauseLine(card.because, clientName);
  const added = card.status === "added";

  // The card's link opens the profile in place (store + ?place=) instead of
  // navigating; modified clicks keep the browser's own behavior.
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    // PhotoCard's only link is the full-card "Open <name>" link.
    const link = (event.target as HTMLElement).closest("a");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(card.tripPlaceId);
  }

  const addLabel = nextSlot ? `Add ${card.name} to Day ${nextSlot.day} ${SLOT_LABELS[nextSlot.slot].toLowerCase()}` : `Add ${card.name} to the itinerary`;
  const add = nextSlot ? (
    size === "lg" ? (
      <Button variant="light" icon={<Plus size={16} strokeWidth={2.2} aria-hidden />} onClick={() => onAdd(card.tripPlaceId, nextSlot.day, nextSlot.slot)} aria-label={addLabel}>
        Add to Day {nextSlot.day}
      </Button>
    ) : (
      <IconButton label={addLabel} icon={<Plus size={16} strokeWidth={2.2} />} onClick={() => onAdd(card.tripPlaceId, nextSlot.day, nextSlot.slot)} />
    )
  ) : (
    <Popover
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      label={`Choose a slot for ${card.name}`}
      align="end"
      panelClassName="w-[360px]"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`Choose a slot for ${card.name}`}
          title={`Choose a slot for ${card.name}`}
          className="inline-flex size-[38px] items-center justify-center rounded-pill bg-surface text-ink transition-colors hover:bg-surface-raised"
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden />
        </button>
      )}
    >
      <SlotPicker
        {...picker}
        onPick={(day, slot) => {
          setPickerOpen(false);
          onAdd(card.tripPlaceId, day, slot);
        }}
      />
    </Popover>
  );

  return (
    <div
      data-place-card={card.tripPlaceId}
      draggable
      onDragStart={(event) => startPlaceDrag(event, card.tripPlaceId)}
      onMouseEnter={() => onHover(card.tripPlaceId)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(card.tripPlaceId)}
      onBlur={() => onHover(null)}
      onClickCapture={onClickCapture}
      onKeyDown={onKeyNav}
      className={cn("rise-in @container", className)}
    >
      <PhotoCard
        src={card.imageUrl ?? NO_IMAGE}
        alt={card.name}
        name={card.name}
        typeLine={typeLine(card)}
        size={size}
        href={`?place=${card.tripPlaceId}`}
        highlighted={highlighted}
        priority={priority}
        className={cn("size-full", arch && "arch-top-fluid!")}
        badges={
          <>
            {card.score !== undefined ? <MatchPill score={card.score} tone="light" /> : null}
            {card.yourPlace ? <YourPlaceBadge /> : fromAsk ? <NewFromAskBadge /> : null}
            {added ? (
              <span className="rounded-pill bg-surface px-2.5 py-[7px] text-ui-sm font-semibold text-ink">In the itinerary</span>
            ) : null}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <Menu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              label={`More for ${card.name}`}
              align="end"
              panelClassName="w-[240px]"
              trigger={(props) => (
                <button
                  {...props}
                  type="button"
                  aria-label={`More for ${card.name}`}
                  title={`More for ${card.name}`}
                  className="inline-flex size-[38px] items-center justify-center rounded-pill bg-surface/85 text-ink opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                >
                  <Ellipsis size={16} strokeWidth={2} aria-hidden />
                </button>
              )}
            >
              <MenuItem
                title={`Not for ${firstName(clientName)}`}
                description="Takes it off the board and out of the itinerary"
                onSelect={() => {
                  setMenuOpen(false);
                  onRemove(card.tripPlaceId);
                }}
              />
            </Menu>
            {add}
          </div>
        }
      >
        {because ? <BecauseRow photos={[]} text={because} size={size === "lg" ? 26 : 24} /> : null}
        {card.yourPlace?.note ? <YourNoteRow note={card.yourPlace.note} /> : null}
      </PhotoCard>
    </div>
  );
}
