import "server-only";

import { and, asc, count, eq, inArray } from "drizzle-orm";

import type { Category, Destination } from "@/lib/contracts";
import { db } from "@/lib/db";
import {
  advisorPlaces,
  clientFavorites,
  clients,
  itinerarySlots,
  tripAsks,
  tripPlaces,
  trips,
  tripTravelers,
} from "@/lib/db/schema";

// What the agent knows about the trip: the get_trip_context tool output and
// the header of the system prompt. Read straight from the tables (no trip
// query module exists yet in this branch). Compact by construction: every
// list is capped so the JSON stays well under 3k tokens.

const MAX_FAVORITES = 8;
const MAX_TAGS = 8;
const MAX_RULES = 8;
const MAX_ADVISOR_PLACES = 15;
const MAX_ASKS = 10;
const MAX_SLOTS = 30;
const MAX_NOTE = 140;

export type TripContext = {
  trip: {
    id: string;
    title: string;
    clientName: string;
    destination: Pick<Destination, "name" | "disambiguation" | "countryCode">;
    startDate?: string;
    endDate?: string;
    datesMode: string;
    adults: number;
    children: number;
  };
  travelers: { name: string; role: string; drivesSearch: boolean; favorites: string[]; tasteTags: string[]; rules: string[] }[];
  advisorPlaces: { placeId: string; name: string; note: string }[];
  board: { category: Category; count: number; added: number }[];
  asks: { id: string; label: string; status: string; resultCount: number }[];
  itinerary: { day: number; slot: string; tripPlaceId?: string; note: string }[];
};

const clip = (text: string, max = MAX_NOTE) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** @returns undefined when the trip does not exist. */
export async function loadTripContext(tripId: string): Promise<TripContext | undefined> {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return undefined;

  const [travelerRows, placeCounts, askRows, slotRows] = await Promise.all([
    db.select().from(tripTravelers).where(eq(tripTravelers.tripId, tripId)).orderBy(asc(tripTravelers.position)),
    db
      .select({ category: tripPlaces.category, status: tripPlaces.status, n: count() })
      .from(tripPlaces)
      .where(eq(tripPlaces.tripId, tripId))
      .groupBy(tripPlaces.category, tripPlaces.status),
    db.select().from(tripAsks).where(eq(tripAsks.tripId, tripId)).orderBy(asc(tripAsks.createdAt)).limit(MAX_ASKS),
    db
      .select()
      .from(itinerarySlots)
      .where(eq(itinerarySlots.tripId, tripId))
      .orderBy(asc(itinerarySlots.day), asc(itinerarySlots.position))
      .limit(MAX_SLOTS),
  ]);

  const clientIds = [trip.clientId, ...travelerRows.map((t) => t.clientId).filter((id): id is string => id !== null)];
  const uniqueClientIds = [...new Set(clientIds)];
  const [clientRows, favoriteRows, advisorRows] = await Promise.all([
    db.select().from(clients).where(inArray(clients.id, uniqueClientIds)),
    db
      .select({ clientId: clientFavorites.clientId, query: clientFavorites.query, position: clientFavorites.position })
      .from(clientFavorites)
      .where(inArray(clientFavorites.clientId, uniqueClientIds))
      .orderBy(asc(clientFavorites.position)),
    db
      .select({ placeId: advisorPlaces.placeId, name: advisorPlaces.placeName, note: advisorPlaces.note })
      .from(advisorPlaces)
      .where(and(eq(advisorPlaces.ownerId, trip.ownerId), eq(advisorPlaces.city, trip.destination.name)))
      .limit(MAX_ADVISOR_PLACES),
  ]);

  const clientById = new Map(clientRows.map((c) => [c.id, c]));
  const favoritesFor = (clientId: string | null) =>
    clientId ? favoriteRows.filter((f) => f.clientId === clientId).slice(0, MAX_FAVORITES).map((f) => f.query) : [];
  const profileOf = (clientId: string | null) => (clientId ? clientById.get(clientId) : undefined);

  // A trip without traveler rows still has its client.
  const travelerList =
    travelerRows.length > 0
      ? travelerRows.map((t) => ({ name: t.name, role: t.role, drivesSearch: t.drivesSearch, clientId: t.clientId }))
      : [{ name: trip.clientName, role: "client", drivesSearch: true, clientId: trip.clientId }];

  const board = new Map<Category, { count: number; added: number }>();
  for (const row of placeCounts) {
    if (row.status === "removed") continue;
    const category = row.category as Category;
    const entry = board.get(category) ?? { count: 0, added: 0 };
    entry.count += row.n;
    if (row.status === "added") entry.added += row.n;
    board.set(category, entry);
  }

  return {
    trip: {
      id: trip.id,
      title: trip.title,
      clientName: trip.clientName,
      destination: {
        name: trip.destination.name,
        disambiguation: trip.destination.disambiguation,
        countryCode: trip.destination.countryCode,
      },
      startDate: trip.startDate ?? undefined,
      endDate: trip.endDate ?? undefined,
      datesMode: trip.datesMode,
      adults: trip.adults,
      children: trip.children,
    },
    travelers: travelerList.map((t) => {
      const profile = profileOf(t.clientId);
      return {
        name: t.name,
        role: t.role,
        drivesSearch: t.drivesSearch,
        favorites: favoritesFor(t.clientId),
        tasteTags: (profile?.tasteTags ?? []).slice(0, MAX_TAGS).map((tag) => tag.name),
        rules: (profile?.groundRules ?? []).slice(0, MAX_RULES).map((rule) => clip(rule)),
      };
    }),
    advisorPlaces: advisorRows.map((p) => ({ placeId: p.placeId, name: p.name, note: clip(p.note) })),
    board: [...board.entries()].map(([category, v]) => ({ category, ...v })),
    asks: askRows.map((a) => ({ id: a.id, label: a.label, status: a.status, resultCount: a.resultCount })),
    itinerary: slotRows.map((s) => ({ day: s.day, slot: s.slot, tripPlaceId: s.tripPlaceId ?? undefined, note: clip(s.note) })),
  };
}
