import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { inScope, type ScopeInput } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { clients, trips, tripTravelers } from "@/lib/db/schema";

import { createTrip } from "./mutations";

// The landing page's example. Everyone shares one workspace, so each visitor
// gets a new copy of the seeded trip and starts from an empty search, not from
// the last visitor's chat. Daan travels alone on it, so every search runs on
// Daan's favorites. A freshly seeded workspace has no Daan and copies the
// seeded trip as it is.

export const EXAMPLE_TRIP_TITLE = "Lisbon for Ana";
const EXAMPLE_CLIENT_NAME = "Daan";

/** A new trip copied from the seeded example, or null when it is not there. */
export async function startExampleTrip(ownerId: string, scope: ScopeInput): Promise<string | null> {
  const [example] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.title, EXAMPLE_TRIP_TITLE), inScope(trips, scope)))
    .orderBy(asc(trips.createdAt))
    .limit(1);
  if (!example?.clientId) return null;

  const place = {
    destination: example.destination,
    cover: example.cover,
    startDate: example.startDate,
    endDate: example.endDate,
    datesMode: example.datesMode === "exact" ? ("exact" as const) : ("unset" as const),
  };

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.name, EXAMPLE_CLIENT_NAME), inScope(clients, scope)))
    .orderBy(asc(clients.createdAt))
    .limit(1);
  if (client) {
    const { trip } = await createTrip(ownerId, {
      ...place,
      clientId: client.id,
      adults: 1,
      children: 0,
      travelers: [],
      title: `Lisbon for ${EXAMPLE_CLIENT_NAME}`,
    });
    return trip.id;
  }

  const travelers = await db
    .select()
    .from(tripTravelers)
    .where(eq(tripTravelers.tripId, example.id))
    .orderBy(asc(tripTravelers.position));

  const { trip } = await createTrip(ownerId, {
    ...place,
    clientId: example.clientId,
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
