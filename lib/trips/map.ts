import type {
  Ask,
  Category,
  ItinerarySlot,
  SlotName,
  TripPlaceSource,
  TripPlaceStatus,
} from "@/lib/contracts";
import type { itinerarySlots, tripAsks } from "@/lib/db/schema";

// Pure row-to-contract mapping. The text columns hold closed sets; these
// narrow them once so the UI never sees a value outside the union.

const CATEGORIES: readonly Category[] = ["eat", "drink", "coffee", "see", "stay", "other"];
const SOURCES: readonly TripPlaceSource[] = ["seed", "ask", "advisor", "manual"];
const STATUSES: readonly TripPlaceStatus[] = ["suggested", "added", "removed"];
export const SLOT_ORDER: readonly SlotName[] = ["morning", "lunch", "afternoon", "dinner", "night", "stay"];
const ASK_STATUSES: readonly Ask["status"][] = ["running", "done", "failed", "archived"];

function narrow<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export const asCategory = (value: string): Category => narrow(CATEGORIES, value, "other");
export const asSource = (value: string): TripPlaceSource => narrow(SOURCES, value, "seed");
export const asPlaceStatus = (value: string): TripPlaceStatus => narrow(STATUSES, value, "suggested");
export const asSlotName = (value: string): SlotName => narrow(SLOT_ORDER, value, "morning");
export const asAskStatus = (value: string): Ask["status"] => narrow(ASK_STATUSES, value, "running");

export function isSlotName(value: string): value is SlotName {
  return (SLOT_ORDER as readonly string[]).includes(value);
}

/**
 * `liveCount` is the number of ask_places rows, counted on read. The stored
 * `result_count` is only the final count written when the ask completes, so
 * it is the fallback, not the source.
 */
export function toAsk(row: typeof tripAsks.$inferSelect, liveCount?: number): Ask {
  return {
    id: row.id,
    label: row.label,
    status: asAskStatus(row.status),
    resultCount: liveCount ?? row.resultCount,
    elapsedMs: row.elapsedMs ?? undefined,
    toolCallId: row.toolCallId ?? undefined,
    loosened: row.loosened,
  };
}

export function toSlot(row: typeof itinerarySlots.$inferSelect): ItinerarySlot {
  return {
    id: row.id,
    day: row.day,
    date: row.date ?? undefined,
    slot: asSlotName(row.slot),
    tripPlaceId: row.tripPlaceId ?? undefined,
    note: row.note,
    noteForTraveler: row.noteForTraveler,
    ...(row.noteSource === "agent" ? { noteSource: "agent" as const } : {}),
    position: row.position,
  };
}

/** Day, then the slot's place in the day, then position. */
export function compareSlots(a: ItinerarySlot, b: ItinerarySlot): number {
  return (
    a.day - b.day ||
    SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) ||
    a.position - b.position
  );
}

/** "Lisbon for Ana": the destination and the client's first name. */
export function defaultTripTitle(destinationName: string, clientName: string): string {
  const first = clientName.trim().split(/\s+/)[0] || clientName.trim();
  return first ? `${destinationName} for ${first}` : destinationName;
}
