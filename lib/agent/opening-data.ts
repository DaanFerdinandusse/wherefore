import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { AuthUser } from "@/lib/auth/server";
import type { ChatOpening } from "@/lib/contracts";
import { db } from "@/lib/db";
import { trips } from "@/lib/db/schema";
import { getTripSnapshot } from "@/lib/trips";

import { ChatRouteError, loadOwnedChat } from "./chat-routes";
import { composeOpening, daysBetween } from "./opening";
import { loadToolTrip } from "./tools/trip-data";

// The facts behind an empty chat's opening (lib/agent/opening.ts): the trip,
// its travelers and itinerary, the favorites that drive its searches (places,
// artists and films of every profiled traveler) and the advisor's saved places
// in the destination. Read for the chat's owner only.

const DEFAULT_DAYS = 3;

/**
 * v3 has no first-list seed: a trip waits for the advisor's brief. An older
 * client that still posts the hidden seed message gets no run; the trip's
 * seed status is settled as done so nothing waits on a list that never comes.
 */
export async function settleSeedStatus(tripId: string): Promise<void> {
  await db
    .update(trips)
    .set({ seedStatus: "done", updatedAt: sql`now()` })
    .where(and(eq(trips.id, tripId), inArray(trips.seedStatus, ["pending", "failed"])));
}

export async function loadChatOpening(chatId: string, user: AuthUser): Promise<ChatOpening> {
  const chat = await loadOwnedChat(chatId, user);
  const snapshot = await getTripSnapshot(chat.tripId, user);
  if (!snapshot) throw new ChatRouteError("not_found:chat", 404, "This chat's trip no longer exists.");
  const ctx = await loadToolTrip(chat.tripId);

  const { trip, travelers, slots } = snapshot;
  const filled = slots.filter((s) => s.tripPlaceId).map((s) => ({ day: s.day, slot: s.slot }));
  const dayCount =
    daysBetween(trip.startDate, trip.endDate) ?? Math.max(DEFAULT_DAYS, ...slots.map((s) => s.day));

  return composeOpening({
    clientName: trip.clientName,
    travelerNames: travelers.length > 0 ? travelers.map((t) => t.name) : [trip.clientName],
    destination: trip.destination.name,
    startDate: trip.datesMode === "exact" ? trip.startDate : undefined,
    endDate: trip.datesMode === "exact" ? trip.endDate : undefined,
    favoritesCount: ctx.signals.favorites.length,
    favoriteOwners: ctx.signals.favoritesUsed.map((f) => f.clientName),
    advisorPlacesInCity: ctx.advisorPlaces.length,
    filled,
    dayCount,
  });
}
