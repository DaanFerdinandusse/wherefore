import type {
  Category,
  Explainability,
  SharedTripDay,
  SharedTripPlace,
  SharedTripSlot,
  SharedTripView,
  TasteTag,
} from "@/lib/contracts";

import { favoriteDrivers } from "@/lib/qloo/normalize";

import { asCategory, asSlotName, SLOT_ORDER } from "./map";

// The public traveler view, projected from rows. Pure: the query in
// queries.ts selects only these columns, and this file decides what of them
// reaches the page. Nothing here carries an id, a score, an ask or an advisor
// place note.

export type SharedTripRow = {
  title: string;
  destinationName: string;
  startDate: string | null;
  endDate: string | null;
  clientName: string;
  advisorName: string | null;
};

export type SharedSlotRow = {
  day: number;
  date: string | null;
  slot: string;
  position: number;
  note: string;
  noteForTraveler: boolean;
  /** "agent" notes are the advisor's working notes: never on the traveler view. */
  noteSource?: string;
  /** Null when the slot holds no place (or a removed one). */
  place: {
    name: string;
    category: string;
    imageUrl: string | null;
    neighborhood: string | null;
    explainability: Explainability;
    sharedTags: TasteTag[];
    reason: string | null;
  } | null;
};

/** "Ana" from "Ana Ruiz". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** YYYY-MM-DD of trip day `day` (1-based) from the start date. */
export function dayDate(startDate: string | null, day: number): string | undefined {
  if (!startDate) return undefined;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start)) return undefined;
  return new Date(start + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

function toSharedPlace(place: NonNullable<SharedSlotRow["place"]>): SharedTripPlace {
  const category: Category = asCategory(place.category);
  return {
    name: place.name,
    category,
    imageUrl: place.imageUrl ?? undefined,
    neighborhood: place.neighborhood ?? undefined,
    // Named favorites only: "Your places" and "Other favorites" are no favorites of the traveler's.
    because: favoriteDrivers(place.explainability).map(({ name, share }) => ({ name, share })),
    sharedTags: place.sharedTags.map((tag) => tag.name),
    reason: place.reason?.trim() || undefined,
  };
}

function toSharedSlot(row: SharedSlotRow): SharedTripSlot | null {
  const note = row.note.trim();
  const advisorNote = row.noteForTraveler && row.noteSource !== "agent" && note ? note : undefined;
  if (!row.place && !advisorNote) return null;
  return {
    slot: asSlotName(row.slot),
    position: row.position,
    ...(row.place ? { place: toSharedPlace(row.place) } : {}),
    ...(advisorNote ? { advisorNote } : {}),
  };
}

/** Days in order, each with its slots in the order of the day. Empty days are left out. */
export function toSharedTripView(trip: SharedTripRow, slots: SharedSlotRow[]): SharedTripView {
  const byDay = new Map<number, { date?: string; slots: SharedTripSlot[] }>();
  const ordered = [...slots].sort(
    (a, b) =>
      a.day - b.day ||
      SLOT_ORDER.indexOf(asSlotName(a.slot)) - SLOT_ORDER.indexOf(asSlotName(b.slot)) ||
      a.position - b.position,
  );
  for (const row of ordered) {
    const slot = toSharedSlot(row);
    if (!slot) continue;
    const day = byDay.get(row.day) ?? { date: row.date ?? dayDate(trip.startDate, row.day), slots: [] };
    day.slots.push(slot);
    byDay.set(row.day, day);
  }
  const days: SharedTripDay[] = [...byDay.entries()].map(([day, value]) => ({
    day,
    ...(value.date ? { date: value.date } : {}),
    slots: value.slots,
  }));
  return {
    title: trip.title,
    destinationName: trip.destinationName,
    ...(trip.startDate ? { startDate: trip.startDate } : {}),
    ...(trip.endDate ? { endDate: trip.endDate } : {}),
    preparedFor: firstName(trip.clientName),
    advisorName: trip.advisorName,
    days,
  };
}
