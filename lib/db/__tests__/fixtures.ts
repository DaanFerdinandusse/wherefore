import { randomUUID } from "node:crypto";

import { eq, like } from "drizzle-orm";

import type { Destination } from "@/lib/contracts";
import { db } from "@/lib/db";
import { advisorPlaces, chats, clients, places, trips } from "@/lib/db/schema";

// Shared helpers for tests that hit the Neon branch. Every run uses its own
// owner id and entity id prefix, and `cleanup` deletes exactly those rows.

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export function testRun() {
  const run = randomUUID().slice(0, 8);
  return {
    owner: `test-owner-${run}`,
    otherOwner: `test-other-${run}`,
    entityPrefix: `test:${run}:`,
  };
}

export const LISBON: Destination = {
  name: "Lisbon",
  disambiguation: "Portugal",
  countryCode: "PT",
  lat: 38.7223,
  lon: -9.1393,
  radiusM: 8000,
};

export async function cleanup(run: ReturnType<typeof testRun>): Promise<void> {
  for (const owner of [run.owner, run.otherOwner]) {
    // Trips first: they restrict client deletes and cascade to their children.
    await db.delete(trips).where(eq(trips.ownerId, owner));
    await db.delete(chats).where(eq(chats.ownerId, owner));
    await db.delete(advisorPlaces).where(eq(advisorPlaces.ownerId, owner));
    await db.delete(clients).where(eq(clients.ownerId, owner));
  }
  await db.delete(places).where(like(places.entityId, `${run.entityPrefix}%`));
}
