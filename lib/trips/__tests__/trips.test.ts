import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient } from "@/lib/clients";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { chats, itinerarySlots, tripPlaces, tripTravelers } from "@/lib/db/schema";
import { listAdvisorPlaces, saveAdvisorPlace, upsertPlaces } from "@/lib/places";
import {
  addAskPlaces,
  createAsk,
  createTrip,
  getTripSnapshot,
  listTrips,
  setShareToken,
  setSlots,
  setStageOverride,
  todayIso,
  updateTrip,
  upsertTripPlaces,
} from "@/lib/trips";

const run = testRun();

type Fixture = {
  clientId: string;
  guestId: string;
  placeIds: Record<string, string>;
};
let f: Fixture;

const entity = (key: string) => `${run.entityPrefix}${key}`;

function newTrip(overrides: Partial<Parameters<typeof createTrip>[1]> = {}) {
  return createTrip(run.owner, {
    clientId: f.clientId,
    destination: LISBON,
    startDate: "2026-05-14",
    endDate: "2026-05-18",
    datesMode: "exact",
    adults: 2,
    children: 0,
    travelers: [{ clientId: f.guestId, name: "Sam Ruiz", role: "guest", drivesSearch: false }],
    ...overrides,
  });
}

describe.skipIf(!hasDatabase)("trips", () => {
  beforeAll(async () => {
    const client = await createClient({ name: "Ana Ruiz", homeCity: "New York" }, run.owner);
    const guest = await createClient({ name: "Sam Ruiz", status: "guest" }, run.owner);
    const placeIds = await upsertPlaces([
      {
        entityId: entity("senhor-uva"),
        name: "Senhor Uva",
        city: "Lisbon",
        images: [{ url: "https://example.test/uva.jpg" }],
      },
      { entityId: entity("cervejaria"), name: "Cervejaria Ramiro", city: "Lisbon" },
      { entityId: entity("gulbenkian"), name: "Gulbenkian Museum", city: "Lisbon" },
    ]);
    f = { clientId: client.id, guestId: guest.id, placeIds };
  });

  afterAll(() => cleanup(run));

  it("createTrip inserts the chat and the travelers with it", async () => {
    const { trip, chatId, travelers } = await newTrip();
    expect(trip.chatId).toBe(chatId);
    expect(trip.title).toBe("Lisbon for Ana");
    expect(trip.search).toBe("Lisbon for Ana Ana Ruiz Lisbon");

    const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chat).toMatchObject({ tripId: trip.id, ownerId: run.owner, status: "idle", messages: [] });

    // The trip's client is added first and drives the search.
    expect(travelers.map((t) => [t.name, t.role, t.drivesSearch, t.position])).toEqual([
      ["Ana Ruiz", "client", true, 0],
      ["Sam Ruiz", "guest", false, 1],
    ]);
    const stored = await db.select().from(tripTravelers).where(eq(tripTravelers.tripId, trip.id));
    expect(stored).toHaveLength(2);

    await expect(createTrip(run.otherOwner, { ...baseInput(), clientId: f.clientId })).rejects.toThrow(
      "No client with that id.",
    );
  });

  it("upsertTripPlaces keeps one row per place, the strongest source and the best score", async () => {
    const { trip } = await newTrip();
    const uva = f.placeIds[entity("senhor-uva")]!;
    const base = { placeId: uva, category: "drink" as const };

    const first = await upsertTripPlaces(
      trip.id,
      [
        { ...base, source: "seed", bestScore: 70, explainability: [{ entityId: "e1", name: "Lilia", share: 100 }] },
        // A duplicate inside one call folds into the same row.
        { ...base, source: "seed", bestScore: 65 },
      ],
      run.owner,
    );
    const tripPlaceId = first[uva]!;

    // Higher priority source with a lower score: source moves up, score stays.
    await upsertTripPlaces(trip.id, [{ ...base, source: "ask", bestScore: 60 }], run.owner);
    let [row] = await db.select().from(tripPlaces).where(eq(tripPlaces.id, tripPlaceId));
    expect(row).toMatchObject({ source: "ask", bestScore: 70 });
    expect(row?.explainability).toEqual([{ entityId: "e1", name: "Lilia", share: 100 }]);

    // Lower priority source with a better score: source stays, score set moves.
    const again = await upsertTripPlaces(
      trip.id,
      [{ ...base, source: "seed", bestScore: 88, bestAffinity: 0.8123, explainability: [] }],
      run.owner,
    );
    expect(again[uva]).toBe(tripPlaceId);
    [row] = await db.select().from(tripPlaces).where(eq(tripPlaces.id, tripPlaceId));
    expect(row).toMatchObject({ source: "ask", bestScore: 88, bestAffinity: "0.8123", explainability: [] });

    await upsertTripPlaces(trip.id, [{ ...base, source: "manual" }], run.owner);
    const rows = await db
      .select()
      .from(tripPlaces)
      .where(and(eq(tripPlaces.tripId, trip.id), eq(tripPlaces.placeId, uva)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "manual", bestScore: 88 });

    // The unique (trip, place) index holds even for a direct insert.
    await expect(
      db.insert(tripPlaces).values({ tripId: trip.id, placeId: uva, source: "seed" }),
    ).rejects.toThrow();
  });

  it("setSlots rejects a trip place from another trip and marks slotted places added", async () => {
    const { trip } = await newTrip();
    const { trip: other } = await newTrip();
    const uva = f.placeIds[entity("senhor-uva")]!;
    const ramiro = f.placeIds[entity("cervejaria")]!;
    const mine = await upsertTripPlaces(trip.id, [{ placeId: uva, source: "seed", category: "drink" }], run.owner);
    const theirs = await upsertTripPlaces(other.id, [{ placeId: ramiro, source: "seed", category: "eat" }], run.owner);

    const result = await setSlots(
      trip.id,
      [
        { day: 1, slot: "night", tripPlaceId: mine[uva] },
        { day: 1, slot: "dinner", tripPlaceId: theirs[ramiro] },
      ],
      "replace",
      run.owner,
    );
    expect(result.applied.map((s) => [s.day, s.slot, s.tripPlaceId])).toEqual([[1, "night", mine[uva]]]);
    expect(result.rejected).toEqual([{ tripPlaceId: theirs[ramiro], reason: "This place is not on this trip." }]);

    const slots = await db.select().from(itinerarySlots).where(eq(itinerarySlots.tripId, trip.id));
    expect(slots).toHaveLength(1);
    const [placed] = await db.select().from(tripPlaces).where(eq(tripPlaces.id, mine[uva]!));
    expect(placed?.status).toBe("added");

    // Another owner cannot write slots on this trip at all.
    await expect(setSlots(trip.id, [], "replace", run.otherOwner)).rejects.toThrow("No trip with that id.");
  });

  it("getTripSnapshot returns the TripSnapshot shape", async () => {
    const { trip, chatId } = await newTrip();
    const uva = f.placeIds[entity("senhor-uva")]!;
    const museum = f.placeIds[entity("gulbenkian")]!;
    const saved = await saveAdvisorPlace(run.owner, { placeId: uva, note: "Ask for the counter" });
    const ids = await upsertTripPlaces(
      trip.id,
      [
        {
          placeId: uva,
          source: "advisor",
          category: "drink",
          bestScore: 91,
          advisorPlaceId: saved.id,
          sharedTags: [{ tagId: "t1", name: "natural wine" }],
        },
        { placeId: museum, source: "seed", category: "see", bestScore: 74 },
      ],
      run.owner,
    );
    const ask = await createAsk(trip.id, { label: "Natural wine · Sat", toolCallId: `call-${run.owner}` }, run.owner);
    const sameAsk = await createAsk(trip.id, { label: "Retry", toolCallId: `call-${run.owner}` }, run.owner);
    expect(sameAsk.id).toBe(ask.id);
    const added = await addAskPlaces(ask.id, [{ tripPlaceId: ids[uva]!, rank: 1, score: 91 }], run.owner);
    expect(added).toEqual({ added: 1, rejected: [] });
    await setSlots(trip.id, [{ day: 2, slot: "lunch", tripPlaceId: ids[museum], note: "Garden first" }], "merge", run.owner);

    const snapshot = await getTripSnapshot(trip.id, run.owner);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.trip).toEqual({
      id: trip.id,
      title: "Lisbon for Ana",
      clientId: f.clientId,
      clientName: "Ana Ruiz",
      destination: LISBON,
      startDate: "2026-05-14",
      endDate: "2026-05-18",
      datesMode: "exact",
      stage: "done",
      shareToken: undefined,
      seedStatus: "pending",
      builtFrom: undefined,
      chatId,
    });
    expect(snapshot!.travelers.map((t) => t.role)).toEqual(["client", "guest"]);
    expect(snapshot!.asks).toEqual([
      { id: ask.id, label: "Natural wine · Sat", status: "running", resultCount: 1, elapsedMs: undefined, toolCallId: `call-${run.owner}`, loosened: [] },
    ]);

    const card = snapshot!.places.find((p) => p.placeId === uva);
    expect(card).toEqual({
      tripPlaceId: ids[uva],
      placeId: uva,
      entityId: entity("senhor-uva"),
      name: "Senhor Uva",
      category: "drink",
      neighborhood: undefined,
      address: undefined,
      lat: undefined,
      lon: undefined,
      imageUrl: "https://example.test/uva.jpg",
      score: 91,
      because: [],
      sharedTags: [{ tagId: "t1", name: "natural wine" }],
      yourPlace: { advisorPlaceId: saved.id, note: "Ask for the counter" },
      reason: undefined,
      status: "suggested",
      source: "advisor",
      askIds: [ask.id],
    });
    expect(snapshot!.places.find((p) => p.placeId === museum)?.status).toBe("added");
    expect(snapshot!.slots).toEqual([
      { id: expect.any(String), day: 2, date: undefined, slot: "lunch", tripPlaceId: ids[museum], note: "Garden first", position: 0 },
    ]);

    // My places counts the trip.
    const mine = await listAdvisorPlaces(run.owner, { city: "lisbon" });
    expect(mine.find((p) => p.id === saved.id)).toMatchObject({ inTrips: 1, lastTripTitle: "Lisbon for Ana" });

    expect(await getTripSnapshot(trip.id, run.otherOwner)).toBeNull();
  });

  it("computes the stage from the override, the share link and the dates", async () => {
    const { trip } = await newTrip({ startDate: "2099-01-01", endDate: "2099-01-05" });
    const stage = async () => (await getTripSnapshot(trip.id, run.owner))!.trip.stage;
    expect(await stage()).toBe("planning");

    const shared = await setShareToken(trip.id, run.owner);
    expect(shared.shareToken).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect((await setShareToken(trip.id, run.owner)).shareToken).toBe(shared.shareToken);
    expect(await stage()).toBe("shared");

    const today = todayIso();
    await updateTrip(trip.id, { startDate: today, endDate: "2099-01-05" }, run.owner);
    expect(await stage()).toBe("traveling");

    await setStageOverride(trip.id, "done", run.owner);
    expect(await stage()).toBe("done");
    const board = await listTrips(run.owner);
    expect(board.done.map((t) => t.id)).toContain(trip.id);

    await setStageOverride(trip.id, null, run.owner);
    expect(await stage()).toBe("traveling");
  });
});

function baseInput() {
  return {
    clientId: f.clientId,
    destination: LISBON,
    datesMode: "unset" as const,
    adults: 1,
    children: 0,
    travelers: [],
  };
}
