"use client";

import { useState, type DragEvent } from "react";

import { slotHolds, slotRule } from "@/lib/trips/day-parts";

import { carriesPlace, carriesSlot, draggedCategory, draggedPlace, draggedSlot } from "../workspace/dnd";
import type { SlotRef } from "../workspace/reducer";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

// A slot as a drop target. It takes a place dragged from the chat (a tile or
// a full card, TRIP_PLACE_TYPE) and a place card dragged from another slot
// (SLOT_TYPE): within a day the two slots swap, across days the places trade.
// A place the slot may not hold (slotHolds) is refused while it hovers: no
// preventDefault means the browser shows no-drop and the drop never lands, and
// `refusal` says why.
export function useSlotDrop(target: SlotRef, actions: WorkspaceActions) {
  const [over, setOver] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  return {
    over,
    refusal,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!carriesSlot(e) && !carriesPlace(e)) return;
        const category = draggedCategory(e);
        if (category && !slotHolds(target.slot, category)) {
          e.dataTransfer.dropEffect = "none";
          if (!refusal) setRefusal(slotRule(category));
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = carriesSlot(e) ? "move" : "copy";
        if (!over) setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        // Moving between children of the target is not leaving it.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOver(false);
        setRefusal(null);
      },
      onDrop: (e: DragEvent) => {
        setOver(false);
        setRefusal(null);
        const from = draggedSlot(e);
        if (from) {
          e.preventDefault();
          void actions.moveToSlot(from, target);
          return;
        }
        const tripPlaceId = draggedPlace(e);
        if (tripPlaceId) {
          e.preventDefault();
          void actions.addToSlot(tripPlaceId, target.day, target.slot, target.position ?? 0);
        }
      },
    },
  };
}
