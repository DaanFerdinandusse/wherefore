import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { clients, trips, tripTravelers } from "@/lib/db/schema";

import { createChatForTrip, getChat, type ChatRow } from "./chat-store";

// Development fixtures for the chat lab and the e2e tests: one client, one
// trip ("Lisbon for Ana (chat lab)") and its chat, owned by the given user.
// Idempotent: finds the rows by title before inserting. Never used in
// production code paths.

export const DEV_TRIP_TITLE = "Lisbon for Ana (chat lab)";

export async function ensureDevTrip(ownerId: string): Promise<{ tripId: string; chatId: string }> {
  const [existing] = await db
    .select({ id: trips.id, chatId: trips.chatId })
    .from(trips)
    .where(and(eq(trips.ownerId, ownerId), eq(trips.title, DEV_TRIP_TITLE)))
    .limit(1);
  if (existing?.chatId && (await getChat(existing.chatId))) return { tripId: existing.id, chatId: existing.chatId };

  let tripId = existing?.id;
  if (!tripId) {
    const [client] = await db
      .insert(clients)
      .values({
        ownerId,
        name: "Ana Ruiz",
        homeCity: "New York",
        notes: "Chat lab client.",
        groundRules: ["No tasting menus", "Walkable evenings"],
        tasteTags: [
          { tagId: "dev-natural-wine", name: "natural wine" },
          { tagId: "dev-seafood", name: "seafood" },
        ],
        search: "ana ruiz new york",
      })
      .returning({ id: clients.id });
    if (!client) throw new Error("Client insert returned no row");
    const [trip] = await db
      .insert(trips)
      .values({
        ownerId,
        clientId: client.id,
        title: DEV_TRIP_TITLE,
        clientName: "Ana Ruiz",
        destination: { name: "Lisbon", disambiguation: "Portugal", countryCode: "PT", lat: 38.7223, lon: -9.1393, radiusM: 8000 },
        startDate: "2026-11-12",
        endDate: "2026-11-16",
        datesMode: "exact",
        adults: 2,
        seedStatus: "done",
        search: "lisbon for ana ana ruiz lisbon",
      })
      .returning({ id: trips.id });
    if (!trip) throw new Error("Trip insert returned no row");
    tripId = trip.id;
    await db.insert(tripTravelers).values([
      { tripId, clientId: client.id, name: "Ana Ruiz", role: "client", drivesSearch: true, position: 0 },
      { tripId, name: "Clara", role: "guest", drivesSearch: false, position: 1 },
    ]);
  }

  return { tripId, chatId: (await linkNewChat(tripId, ownerId)).id };
}

/** A fresh chat for the trip, linked from trips.chat_id (tests use one per scenario). */
export async function linkNewChat(tripId: string, ownerId: string): Promise<ChatRow> {
  const chat = await createChatForTrip(tripId, ownerId);
  await db.update(trips).set({ chatId: chat.id }).where(eq(trips.id, tripId));
  return chat;
}
