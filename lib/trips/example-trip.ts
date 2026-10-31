import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { inScope, type ScopeInput } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { trips, tripTravelers } from "@/lib/db/schema";

import { createTrip } from "./mutations";

// The landing page's example. Everyone shares one workspace, so each visitor
// gets a new copy of the seeded trip and starts from an empty search, not from
// the last visitor's chat.

export const EXAMPLE_TRIP_TITLE = "Lisbon for Ana";

/** A new trip copied from the seeded example, or null when it is not there. */
export async function startExampleTrip(ownerId: string, scope: ScopeInput): Promise<string | null> {
  const [example] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.title, EXAMPLE_TRIP_TITLE), inScope(trips, scope)))
    .orderBy(asc(trips.createdAt))
    .limit(1);
  if (!example?.clientId) return null;

  const travelers = await db
    .select()
    .from(tripTravelers)
    .where(eq(tripTravelers.tripId, example.id))
    .orderBy(asc(tripTravelers.position));

  const { trip } = await createTrip(ownerId, {
    clientId: example.clientId,
    destination: example.destination,
    cover: example.cover,
    startDate: example.startDate,
    endDate: example.endDate,
    datesMode: example.datesMode === "exact" ? "exact" : "unset",
    adults: example.adults,
    children: example.children,
    travelers: travelers.map((t) => ({
      clientId: t.clientId,
      name: t.name,
      role: t.role === "client" ? "client" : "guest",
      drivesSearch: t.drivesSearch,
    })),
    title: example.title,
  });
  return trip.id;
}
