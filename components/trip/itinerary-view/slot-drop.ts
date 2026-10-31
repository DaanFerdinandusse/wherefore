"use client";

import { useState, type DragEvent } from "react";

import { partOpenSlot, slotHolds, slotRule } from "@/lib/trips/day-parts";

import { carriesPlace, carriesSlot, draggedCategory, draggedFrom, draggedPlace, draggedSlot } from "../workspace/dnd";
import type { SlotRef } from "../workspace/reducer";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

import { joinsSlot, partDrop, type PartDrop } from "./itinerary-model";

/** `position` undefined lets addToSlot append, and skip a place already in the slot. */
function dropOn(e: DragEvent, target: SlotRef, actions: WorkspaceActions, position: number | undefined) {
  const from = draggedSlot(e);
  if (from) {
    e.preventDefault();
    void actions.moveToSlot(from, target);
    return;
  }
  const tripPlaceId = draggedPlace(e);
  if (tripPlaceId) {
    e.preventDefault();
    void actions.addToSlot(tripPlaceId, target.day, target.slot, position);
  }
}

// A slot as a drop target. It takes a place dragged from the chat (a tile or
// a full card, TRIP_PLACE_TYPE) and a place card dragged from another slot
// (SLOT_TYPE): within a day the two slots swap, across days the places trade.
// A place the slot may not hold (slotHolds) is refused while it hovers: no
// preventDefault means the browser shows no-drop and the drop never lands, and
// `refusal` says why, unless the part around the slot takes the place instead.
// A `filled` row of an open slot leaves a place from elsewhere to the part too
// (joinsSlot), which adds it next to the row instead of swapping.
export function useSlotDrop(target: SlotRef, actions: WorkspaceActions, { filled = false }: { filled?: boolean } = {}) {
  const joins = (e: DragEvent) => filled && joinsSlot(target, draggedFrom(e));
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
          const open = partOpenSlot(target.slot);
          if (!refusal && !(open && slotHolds(open, category))) setRefusal(slotRule(category));
          return;
        }
        if (joins(e)) return;
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
        // What this slot refuses or leaves goes on to the part around it.
        const category = draggedCategory(e);
        if ((category && !slotHolds(target.slot, category)) || joins(e)) return;
        dropOn(e, target, actions, target.position ?? 0);
      },
    },
  };
}

// A part as a drop target, around its rows. Events reach it after the row under
// the pointer has had them, so a row that takes the drop has already called
// preventDefault. Whatever is left lands on `add`, the part's next open row,
// which has no row of its own until the drop makes one (partDrop).
export function usePartDrop(add: Required<SlotRef>, actions: WorkspaceActions) {
  const [state, setState] = useState<PartDrop>("none");
  const [refusal, setRefusal] = useState<string | null>(null);
  const reset = () => {
    setState("none");
    setRefusal(null);
  };
  return {
    state,
    refusal,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!carriesSlot(e) && !carriesPlace(e)) return;
        const category = draggedCategory(e);
        const next = partDrop(add, { category, from: draggedFrom(e), rowTakes: e.defaultPrevented });
        setState(next);
        setRefusal(next === "refused" && category ? slotRule(category) : null);
        if (next !== "armed") return;
        e.preventDefault();
        e.dataTransfer.dropEffect = carriesSlot(e) ? "move" : "copy";
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        reset();
      },
      onDrop: (e: DragEvent) => {
        reset();
        if (!e.defaultPrevented) dropOn(e, add, actions, undefined);
      },
    },
  };
}
