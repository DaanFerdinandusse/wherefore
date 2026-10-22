import type { SharedTripView, TripSnapshot } from "@/lib/contracts";
import { favoriteDrivers } from "@/lib/qloo/normalize";
import { type SharedSlotRow, toSharedTripView } from "@/lib/trips/share";

// The workspace's "Traveler view" tab renders before a share link exists, so
// it cannot read the view by token. This projects the trip snapshot through
// the same pure projection the public page uses (lib/trips/share.ts), so the
// tab and /s/[token] can never show different things: no scores, no asks,
// no removed places, no advisor place notes, slot notes only when marked for
// the traveler.
export function travelerViewFromSnapshot(snapshot: TripSnapshot, advisorName: string | null): SharedTripView {
  const cards = new Map(snapshot.places.map((card) => [card.tripPlaceId, card]));
  const rows: SharedSlotRow[] = snapshot.slots.map((slot) => {
    const card = slot.tripPlaceId ? cards.get(slot.tripPlaceId) : undefined;
    const place =
      card && card.status !== "removed"
        ? {
            name: card.name,
            category: card.category,
            imageUrl: card.imageUrl ?? null,
            neighborhood: card.neighborhood ?? null,
            // Never credit "Your places" or "Other favorites" as a favorite (toSharedTripView drops them too).
            explainability: favoriteDrivers(card.because),
            sharedTags: card.sharedTags,
            reason: card.reason ?? null,
          }
        : null;
    return {
      day: slot.day,
      date: slot.date ?? null,
      slot: slot.slot,
      position: slot.position,
      note: slot.note,
      noteForTraveler: slot.noteForTraveler ?? false,
      noteSource: slot.noteSource ?? "advisor",
      place,
    };
  });
  return toSharedTripView(
    {
      title: snapshot.trip.title,
      destinationName: snapshot.trip.destination.name,
      startDate: snapshot.trip.startDate ?? null,
      endDate: snapshot.trip.endDate ?? null,
      clientName: snapshot.trip.clientName,
      advisorName,
    },
    rows,
  );
}
