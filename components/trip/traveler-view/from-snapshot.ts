import type { SharedTripView, TripSnapshot } from "@/lib/contracts";
import { favoriteDrivers } from "@/lib/qloo/normalize";
import { type SharedFavoriteRow, type SharedSlotRow, toSharedTripView } from "@/lib/trips/share";

// The workspace's traveler view reads the full view from the server. This is
// its fallback when that read fails: it projects the trip snapshot through
// the same pure projection the public page uses (lib/trips/share.ts), so it
// never shows what /s/[token] would hide: no scores, no asks, no removed
// places, no advisor place notes, slot notes only when marked for the
// traveler. The snapshot carries one photo per place and no descriptions, so
// the fallback shows less than the link where the card has less.

/** What the workspace may add that the snapshot does not hold. */
export type TravelerViewExtras = {
  /** The advisor's email, for the "Message" action. */
  advisorEmail?: string | null;
  /** The travelers' favorites with photos, for the favorites band and the reasons. */
  favorites?: SharedFavoriteRow[];
};

export function travelerViewFromSnapshot(
  snapshot: TripSnapshot,
  advisorName: string | null,
  extras: TravelerViewExtras = {},
): SharedTripView {
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
            keywords: card.keywords,
            dishes: card.dishes,
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
      cover: snapshot.trip.cover ?? null,
      startDate: snapshot.trip.startDate ?? null,
      endDate: snapshot.trip.endDate ?? null,
      clientName: snapshot.trip.clientName,
      advisorName,
      advisorEmail: extras.advisorEmail ?? null,
    },
    rows,
    extras.favorites ?? [],
  );
}
