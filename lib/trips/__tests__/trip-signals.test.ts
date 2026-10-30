import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addFavorite, createClient, setMediaFavorites } from "@/lib/clients";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { trips } from "@/lib/db/schema";
import { upsertPlaces } from "@/lib/places";
import { createTrip, setSlots, setTripPlaceStatus, upsertTripPlaces, type Trip } from "@/lib/trips";
import { signalSetHash } from "@/lib/trips/evidence";
import { loadTripSignals } from "@/lib/trips/trip-signals";

describe.skipIf(!hasDatabase)("loadTripSignals", () => {
  const run = testRun();
  const entity = (key: string) => `${run.entityPrefix}${key}`;
  let trip: Trip;
  let placeIds: Record<string, string> = {};
  let tripPlaceIds: Record<string, string> = {};

  beforeAll(async () => {
    const client = await createClient({ name: "Ana Ruiz", homeCity: "New York" }, run.owner);
    placeIds = await upsertPlaces([
      { entityId: entity("via"), name: "Via Carota" },
      { entityId: entity("slot-a"), name: "In the itinerary" },
      { entityId: entity("slot-b"), name: "Also in the itinerary" },
      { entityId: entity("shown"), name: "Only shown" },
      { entityId: entity("gone"), name: "Removed" },
    ]);
    await addFavorite(client.id, { query: "via carota", entityId: entity("via"), placeId: placeIds[entity("via")], match: "resolved", candidates: [] }, run.owner);
    await setMediaFavorites(
      client.id,
      [
        { query: "khruangbin", kind: "artist", entityId: entity("khruangbin"), name: "Khruangbin" },
        { query: "in the mood for love", kind: "movie", entityId: entity("mood"), name: "In the Mood for Love" },
      ],
      run.owner,
    );
    const created = await createTrip(run.owner, {
      clientId: client.id,
      destination: LISBON,
      startDate: "2026-05-14",
      endDate: "2026-05-16",
      datesMode: "exact",
      adults: 1,
      children: 0,
      travelers: [],
    });
    const [row] = await db.select().from(trips).where(eq(trips.id, created.trip.id));
    trip = row!;
    tripPlaceIds = await upsertTripPlaces(
      trip.id,
      ["slot-a", "slot-b", "shown", "gone"].map((key) => ({
        placeId: placeIds[entity(key)]!,
        source: "ask" as const,
        category: "eat" as const,
        bestAffinity: 0.8,
        bestScore: 80,
      })),
      run.owner,
    );
  });

  afterAll(() => cleanup(run));

  it("reads places first, then artists and films, with an empty itinerary", async () => {
    const { signals, excludeIds } = await loadTripSignals(trip);
    expect(signals.signals).toEqual([entity("via"), entity("khruangbin"), entity("mood")]);
    expect(signals.favoritesUsed).toEqual([{ clientName: "Ana Ruiz", names: ["Via Carota", "Khruangbin", "In the Mood for Love"] }]);
    expect(signals.tripPickSignals).toEqual([]);
    expect(excludeIds).toEqual([]);
    expect(signalSetHash(signals.signals)).toBe(signalSetHash([entity("via"), entity("khruangbin"), entity("mood")]));
  });

  it("adds itinerary places as picks, and leaves out the itinerary and the removed places", async () => {
    await setSlots(
      trip.id,
      [
        { day: 2, slot: "dinner", tripPlaceId: tripPlaceIds[placeIds[entity("slot-b")]!]! },
        { day: 1, slot: "lunch", tripPlaceId: tripPlaceIds[placeIds[entity("slot-a")]!]! },
        { day: 1, slot: "dinner", tripPlaceId: tripPlaceIds[placeIds[entity("gone")]!]! },
      ],
      "replace",
      run.owner,
    );
    await setTripPlaceStatus(tripPlaceIds[placeIds[entity("gone")]!]!, "removed", run.owner);

    const { signals, excludeIds } = await loadTripSignals(trip);
    expect(signals.tripPickSignals).toEqual([entity("slot-a"), entity("slot-b")]);
    expect(signals.signals.slice(0, 3)).toEqual([entity("via"), entity("khruangbin"), entity("mood")]);
    expect(excludeIds).toEqual([entity("slot-a"), entity("slot-b"), entity("gone")]);
    // Only shown: stays available for another slot.
    expect(excludeIds).not.toContain(entity("shown"));
  });
});
