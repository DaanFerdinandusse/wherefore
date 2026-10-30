// Native drag and drop between the board and the itinerary: a board card
// carries its trip place id, a slot card in the itinerary view carries its
// day, slot and position. Custom types keep foreign drags (files, links) out.

import type { DragEvent } from "react";

import type { Category, SlotName } from "@/lib/contracts";
import { asCategory } from "@/lib/trips/map";

export const TRIP_PLACE_TYPE = "application/x-wherefore-trip-place";
export const SLOT_TYPE = "application/x-wherefore-slot";
// A drag's data can only be read on drop. Its types can be read while it
// hovers, so the category travels in a type: a target refuses before the drop.
const CATEGORY_TYPE = "application/x-wherefore-category-";
// The slot a card left travels the same way, so a part knows not to offer a
// new row to the card that just came from it.
const FROM_TYPE = "application/x-wherefore-from-";

export function startPlaceDrag(event: DragEvent, tripPlaceId: string, category: Category) {
  event.dataTransfer.setData(TRIP_PLACE_TYPE, tripPlaceId);
  event.dataTransfer.setData(`${CATEGORY_TYPE}${category}`, category);
  event.dataTransfer.effectAllowed = "copyMove";
}

/** The kind of place being dragged, readable while it hovers. */
export function draggedCategory(event: DragEvent): Category | null {
  const type = event.dataTransfer.types.find((t) => t.startsWith(CATEGORY_TYPE));
  return type ? asCategory(type.slice(CATEGORY_TYPE.length)) : null;
}

export type DraggedSlot = { day: number; slot: SlotName; position: number };

export function startSlotDrag(event: DragEvent, from: DraggedSlot) {
  event.dataTransfer.setData(SLOT_TYPE, JSON.stringify(from));
  event.dataTransfer.setData(`${FROM_TYPE}${from.day}-${from.slot}`, from.slot);
  event.dataTransfer.effectAllowed = "move";
}

/** The day and slot a slot card left, readable while it hovers. Null for a place from the chat. */
export function draggedFrom(event: DragEvent): Pick<DraggedSlot, "day" | "slot"> | null {
  const type = event.dataTransfer.types.find((t) => t.startsWith(FROM_TYPE));
  if (!type) return null;
  const [day, slot] = type.slice(FROM_TYPE.length).split("-");
  return { day: Number(day), slot: slot as SlotName };
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

export function draggedSlot(event: DragEvent): DraggedSlot | null {
  try {
    const value = JSON.parse(event.dataTransfer.getData(SLOT_TYPE)) as { day?: unknown; slot?: unknown; position?: unknown };
    if (typeof value.day !== "number" || typeof value.slot !== "string") return null;
    return { day: value.day, slot: value.slot as SlotName, position: typeof value.position === "number" ? value.position : 0 };
  } catch {
    return null;
  }
}
