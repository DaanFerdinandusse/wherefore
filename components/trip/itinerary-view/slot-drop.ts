"use client";

import { useState, type DragEvent } from "react";

import { carriesPlace, carriesSlot, draggedPlace, draggedSlot } from "../workspace/dnd";
import type { SlotRef } from "../workspace/reducer";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

// A slot as a drop target. It takes a place dragged from the chat (a tile or
// a full card, TRIP_PLACE_TYPE) and a place card dragged from another slot
// (SLOT_TYPE): within a day the two slots swap, across days the places trade.
export function useSlotDrop(target: SlotRef, actions: WorkspaceActions) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!carriesSlot(e) && !carriesPlace(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = carriesSlot(e) ? "move" : "copy";
        if (!over) setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        // Moving between children of the target is not leaving it.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOver(false);
      },
      onDrop: (e: DragEvent) => {
        setOver(false);
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
