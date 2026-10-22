"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { NotFoundError } from "@/lib/auth/errors";
import { inScope } from "@/lib/auth/scope";
import { requireUser } from "@/lib/auth/server";
import type { ItinerarySlot, TripPlaceCard } from "@/lib/contracts";
import { db } from "@/lib/db";
import { tripPlaces, trips } from "@/lib/db/schema";
import { addDays } from "@/lib/ui/dates";
import { getAdvisorPlaceForPlace, removeAdvisorPlace, saveAdvisorPlace, updateAdvisorPlaceNote } from "@/lib/places";

import { SLOT_ORDER } from "./map";
import { setTripPlaceStatus, upsertSlot } from "./mutations";
import type { TripPlaceProfileAdvisorPlace } from "./profile-types";
import { getTrip, listTripPlaceCards } from "./queries";
import { replaceTripPlace } from "./replace";

// Server actions behind the place profile sheet: add to a slot, remove (with
// a replacement), "In my places" and the note. Each starts with
// requireUser(), validates its arguments (they come from the browser) and
// returns the rows the workspace store patches in.

const uuid = z.uuid();
const slotName = z.enum(SLOT_ORDER as unknown as [ItinerarySlot["slot"], ...ItinerarySlot["slot"][]]);

async function cardOf(tripId: string, tripPlaceId: string, user: Awaited<ReturnType<typeof requireUser>>) {
  const [card] = await listTripPlaceCards(tripId, user, { tripPlaceIds: [tripPlaceId] });
  return card ?? null;
}

/** Puts the place in a day's slot (replacing what was there) and returns the slot and the card. */
export async function addToSlotAction(
  tripId: string,
  tripPlaceId: string,
  day: number,
  slot: ItinerarySlot["slot"],
): Promise<{ slot: ItinerarySlot; card: TripPlaceCard | null }> {
  const user = await requireUser();
  const input = z
    .object({ tripId: uuid, tripPlaceId: uuid, day: z.number().int().min(1).max(60), slot: slotName })
    .parse({ tripId, tripPlaceId, day, slot });
  const trip = await getTrip(input.tripId, user);
  if (!trip) throw new NotFoundError("trip");
  const date = trip.startDate && trip.datesMode === "exact" ? addDays(trip.startDate, input.day - 1) : null;
  const saved = await upsertSlot(
    input.tripId,
    { day: input.day, slot: input.slot, tripPlaceId: input.tripPlaceId, date, position: 0 },
    user,
  );
  return { slot: saved, card: await cardOf(input.tripId, input.tripPlaceId, user) };
}

/**
 * "Not for Ana": marks the place removed. With `replace` the same ask (or
 * category) is asked again without the trip's places and the best new place
 * comes back as `replacement` (null when nothing new was found).
 */
export async function removeTripPlaceAction(
  tripId: string,
  tripPlaceId: string,
  replace: boolean,
): Promise<{ removedId: string; replacement: TripPlaceCard | null }> {
  const user = await requireUser();
  const input = z.object({ tripId: uuid, tripPlaceId: uuid, replace: z.boolean() }).parse({ tripId, tripPlaceId, replace });
  if (input.replace) {
    const replacement = await replaceTripPlace(input.tripId, input.tripPlaceId, user);
    return { removedId: input.tripPlaceId, replacement };
  }
  const trip = await getTrip(input.tripId, user);
  if (!trip) throw new NotFoundError("trip");
  await setTripPlaceStatus(input.tripPlaceId, "removed", user);
  return { removedId: input.tripPlaceId, replacement: null };
}

/**
 * "In my places": saves the place to the advisor's library and marks this
 * trip place as "Your place", or removes it from the library (which clears
 * the mark everywhere through the foreign key).
 */
export async function toggleMyPlaceAction(
  tripId: string,
  tripPlaceId: string,
  saved: boolean,
): Promise<{ card: TripPlaceCard | null; advisorPlace: TripPlaceProfileAdvisorPlace | null }> {
  const user = await requireUser();
  const input = z.object({ tripId: uuid, tripPlaceId: uuid, saved: z.boolean() }).parse({ tripId, tripPlaceId, saved });
  const card = await cardOf(input.tripId, input.tripPlaceId, user);
  if (!card) throw new NotFoundError("trip place");

  if (!input.saved) {
    const existing = await getAdvisorPlaceForPlace(user, card.placeId);
    if (existing) await removeAdvisorPlace(existing.id, user);
    return { card: await cardOf(input.tripId, input.tripPlaceId, user), advisorPlace: null };
  }

  const advisorPlace = await saveAdvisorPlace(user, { placeId: card.placeId });
  // Link the trip place to the saved row so the board shows "Your place".
  // Scoped through the trip; the source and score stay as they are.
  await db
    .update(tripPlaces)
    .set({ advisorPlaceId: advisorPlace.id, updatedAt: sql`now()` })
    .where(
      and(
        eq(tripPlaces.id, input.tripPlaceId),
        inArray(tripPlaces.tripId, db.select({ id: trips.id }).from(trips).where(inScope(trips, user))),
      ),
    );
  const [usage] = await db
    .select({ count: sql<number>`count(distinct ${tripPlaces.tripId})::int` })
    .from(tripPlaces)
    .where(eq(tripPlaces.advisorPlaceId, advisorPlace.id));
  return {
    card: await cardOf(input.tripId, input.tripPlaceId, user),
    advisorPlace: {
      id: advisorPlace.id,
      note: advisorPlace.note,
      savedAt: advisorPlace.savedAt.toISOString(),
      inTrips: usage?.count ?? 0,
    },
  };
}

/** Saves the advisor's private note on a saved place. */
export async function editNoteAction(advisorPlaceId: string, note: string): Promise<{ id: string; note: string }> {
  const user = await requireUser();
  const input = z.object({ advisorPlaceId: uuid, note: z.string().max(2000) }).parse({ advisorPlaceId, note });
  const row = await updateAdvisorPlaceNote(input.advisorPlaceId, input.note, user);
  return { id: row.id, note: row.note };
}
