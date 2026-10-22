// Native drag and drop between the board and the itinerary: a board card
// carries its trip place id, a slot card in the itinerary view carries its
// day and slot. Custom types keep foreign drags (files, links) out.

import type { DragEvent } from "react";

import type { SlotName } from "@/lib/contracts";

export const TRIP_PLACE_TYPE = "application/x-tastebrief-trip-place";
export const SLOT_TYPE = "application/x-tastebrief-slot";

export function startPlaceDrag(event: DragEvent, tripPlaceId: string) {
  event.dataTransfer.setData(TRIP_PLACE_TYPE, tripPlaceId);
  event.dataTransfer.effectAllowed = "copyMove";
}

export function startSlotDrag(event: DragEvent, from: { day: number; slot: SlotName }) {
  event.dataTransfer.setData(SLOT_TYPE, JSON.stringify(from));
  event.dataTransfer.effectAllowed = "move";
}

export function carriesPlace(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(TRIP_PLACE_TYPE);
}

export function carriesSlot(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(SLOT_TYPE);
}

export function draggedPlace(event: DragEvent): string | null {
  return event.dataTransfer.getData(TRIP_PLACE_TYPE) || null;
}

export function draggedSlot(event: DragEvent): { day: number; slot: SlotName } | null {
  try {
    const value = JSON.parse(event.dataTransfer.getData(SLOT_TYPE)) as { day?: unknown; slot?: unknown };
    if (typeof value.day !== "number" || typeof value.slot !== "string") return null;
    return { day: value.day, slot: value.slot as SlotName };
  } catch {
    return null;
  }
}
