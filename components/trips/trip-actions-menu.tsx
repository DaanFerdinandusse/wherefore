"use client";

import { useState } from "react";
import { Ellipsis } from "lucide-react";

import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import type { TripStage } from "@/lib/contracts";
import type { TripCard } from "@/lib/trips/contracts";
import { cn } from "@/lib/ui/cn";

import { STAGE_COLUMNS } from "./columns";

// The "..." menu on a card or a list row: open the trip, move it to another
// stage (the keyboard way to do a drag), and reset a stage set by hand.
// `reveal` hides the button until the row is hovered or focused; `className`
// positions the wrapper.
export function TripActionsMenu({
  card,
  onMove,
  onResetStage,
  reveal = true,
  className,
}: {
  card: TripCard;
  onMove: (tripId: string, stage: TripStage) => void;
  onResetStage: (tripId: string) => void;
  reveal?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const href = `/trips/${card.id}`;
  return (
    <div className={className}>
      <Menu
        open={open}
        onOpenChange={setOpen}
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
              "inline-flex size-8 items-center justify-center rounded-pill bg-surface-raised/90 text-ink shadow-xs transition hover:bg-surface-raised",
              reveal && "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
              open && "opacity-100",
            )}
          >
            <Ellipsis size={16} strokeWidth={2} aria-hidden />
          </button>
        )}
      >
        <MenuItem title="Open trip" href={href} onSelect={() => setOpen(false)} />
        {card.stageOverride ? (
          <MenuItem
            title="Reset to computed stage"
            onSelect={() => {
              setOpen(false);
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
              setOpen(false);
              onMove(card.id, column.stage);
            }}
          />
        ))}
      </Menu>
    </div>
  );
}
