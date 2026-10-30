// The checks on the "Before Ana sees it" sheet (L1). Pure: built from the
// itinerary days the panel already computed, the slot rows and the places.
// Every count comes from data; nothing is guessed.

import type { ItinerarySlot, SlotName, TripPlaceCard } from "@/lib/contracts";
import { favoriteDrivers } from "@/lib/qloo/normalize";

import type { DayView } from "@/components/trip/itinerary-view/itinerary-model";
import { firstName, weekday } from "@/components/trip/itinerary-view/itinerary-model";
import { SLOT_LABELS } from "@/components/trip/workspace/format";

export type OpenSlotCheck = { day: number; slot: SlotName; title: string; detail: string; place: TripPlaceCard };

export type NoteCheck = {
  day: number;
  slot: SlotName;
  position: number;
  /** The place in the slot, or the slot ("Friday dinner") when it is open. */
  label: string;
  note: string;
  shown: boolean;
};

export type ShareReview = {
  /** The traveler's first name. */
  client: string;
  cover?: string;
  /** Photos of the places in the link, in itinerary order. */
  thumbnails: { id: string; imageUrl: string; name: string }[];
  placeCount: number;
  /** "a cover photo and 9 places" */
  linkDetail: string;
  openSlots: OpenSlotCheck[];
  notes: NoteCheck[];
  /** Notes that stay out of the link: slot notes not shown, agent notes, saved place notes. */
  privateCount: number;
  reasons: { title: string; detail: string; complete: boolean };
};

/** "Friday dinner", "Day 2 lunch". */
export function slotName(day: Pick<DayView, "day" | "date">, slot: SlotName): string {
  return `${day.date ? weekday(day.date) : `Day ${day.day}`} ${SLOT_LABELS[slot].toLowerCase()}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function hasReason(card: TripPlaceCard): boolean {
  return favoriteDrivers(card.because).length > 0 || card.sharedTags.length > 0 || !!card.reason?.trim();
}

export function shareReview(input: {
  clientName: string;
  days: DayView[];
  slots: ItinerarySlot[];
  places: Record<string, TripPlaceCard>;
}): ShareReview {
  const client = firstName(input.clientName);
  const slotViews = input.days.flatMap((d) => d.slots.map((s) => ({ day: d, view: s })));
  const inLink = slotViews.flatMap(({ view }) => (view.card ? [view.card] : []));
  const unique = [...new Map(inLink.map((c) => [c.tripPlaceId, c])).values()];

  const withImages = unique.filter((c): c is TripPlaceCard & { imageUrl: string } => !!c.imageUrl);
  const cover = withImages[0]?.imageUrl;
  const placeCount = unique.length;
  const placesText = `${placeCount} ${placeCount === 1 ? "place" : "places"}`;
  const linkDetail = cover ? `a cover photo and ${placesText}` : placesText;

  const openSlots: OpenSlotCheck[] = slotViews.flatMap(({ day, view }) =>
    !view.card && view.suggestion
      ? [
          {
            day: day.day,
            slot: view.slot,
            title: `${capitalize(slotName(day, view.slot))} is still open`,
            detail: `${view.suggestion.name} is not added`,
            place: view.suggestion,
          },
        ]
      : [],
  );

  const dayOf = new Map(input.days.map((d) => [d.day, d]));
  const notes: NoteCheck[] = [];
  let privateCount = 0;
  for (const row of input.slots) {
    const note = row.note.trim();
    if (!note) continue;
    if (row.noteSource === "agent") {
      privateCount += 1;
      continue;
    }
    const card = row.tripPlaceId ? input.places[row.tripPlaceId] : undefined;
    const day = dayOf.get(row.day) ?? { day: row.day };
    notes.push({
      day: row.day,
      slot: row.slot,
      position: row.position,
      label: card && card.status !== "removed" ? card.name : capitalize(slotName(day, row.slot)),
      note,
      shown: row.noteForTraveler ?? false,
    });
    if (!row.noteForTraveler) privateCount += 1;
  }
  privateCount += unique.filter((c) => c.yourPlace?.note.trim()).length;

  const matched = unique.filter((c) => favoriteDrivers(c.because).length > 0).length;
  const missing = unique.filter((c) => !hasReason(c)).length;
  const reasons = {
    complete: missing === 0,
    title:
      missing === 0
        ? "Every place has a reason"
        : `${missing} ${missing === 1 ? "place has" : "places have"} no reason yet`,
    detail: `${matched} of ${placeCount} match ${client}'s favorites`,
  };

  return {
    client,
    ...(cover ? { cover } : {}),
    thumbnails: withImages.map((c) => ({ id: c.tripPlaceId, imageUrl: c.imageUrl, name: c.name })),
    placeCount,
    linkDetail,
    openSlots,
    notes,
    privateCount,
    reasons,
  };
}

/** "Ana sees 1 note", "Ana sees no notes". */
export function notesTitle(client: string, notes: NoteCheck[]): string {
  const shown = notes.filter((n) => n.shown).length;
  if (shown === 0) return `${client} sees no notes`;
  return `${client} sees ${shown} ${shown === 1 ? "note" : "notes"}`;
}

/** "3 notes are not in the link". */
export function privateDetail(count: number): string {
  if (count === 0) return "No private notes on this trip";
  return `${count} ${count === 1 ? "note is" : "notes are"} not in the link`;
}
