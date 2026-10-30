import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient, updateClientFields } from "@/lib/clients";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { chats, clients, itinerarySlots, tripAsks, tripPlaces, trips, tripTravelers } from "@/lib/db/schema";
import { listAdvisorPlaces, saveAdvisorPlace, upsertPlaces } from "@/lib/places";
import {
  addAskPlaces,
  clearSlot,
  computeStage,
  createAsk,
  createTrip,
  getSharedTripView,
  getTrip,
  getTripSnapshot,
  listTripPlaceCards,
  listTrips,
  setShareToken,
  setSlots,
  setStageOverride,
  setTripPlaceStatus,
  todayIso,
  updateAsk,
  updateTrip,
  upsertSlot,
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
    expect(row).toMatchObject({ source: "ask", bestScore: 88, bestAffinity: 0.8123, explainability: [] });

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
      { id: expect.any(String), day: 2, date: undefined, slot: "lunch", tripPlaceId: ids[museum], note: "Garden first", noteForTraveler: false, position: 0 },
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
    expect(board.done.trips.map((t) => t.id)).toContain(trip.id);

    await setStageOverride(trip.id, null, run.owner);
    expect(await stage()).toBe("traveling");
  });

  it("never links another advisor's saved place or a different place", async () => {
    const { trip } = await newTrip();
    const uva = f.placeIds[entity("senhor-uva")]!;
    const museum = f.placeIds[entity("gulbenkian")]!;
    const theirs = await saveAdvisorPlace(run.otherOwner, { placeId: uva, note: "Their private note" });
    const mine = await saveAdvisorPlace(run.owner, { placeId: museum, note: "Mine, for the museum" });

    const ids = await upsertTripPlaces(
      trip.id,
      [
        // Another owner's saved place for the same place id.
        { placeId: uva, source: "advisor", category: "drink", advisorPlaceId: theirs.id },
        // My saved place, but for a different place.
        { placeId: f.placeIds[entity("cervejaria")]!, source: "advisor", category: "eat", advisorPlaceId: mine.id },
      ],
      run.owner,
    );
    const stored = await db.select().from(tripPlaces).where(eq(tripPlaces.tripId, trip.id));
    expect(stored.map((row) => row.advisorPlaceId)).toEqual([null, null]);

    // A link written past the helper still does not join on read.
    await db.update(tripPlaces).set({ advisorPlaceId: theirs.id }).where(eq(tripPlaces.id, ids[uva]!));
    const cards = await listTripPlaceCards(trip.id, run.owner);
    expect(cards.find((c) => c.placeId === uva)?.yourPlace).toBeUndefined();
    expect(JSON.stringify(cards)).not.toContain("Their private note");

    // My own saved place for the same place does link.
    await upsertTripPlaces(trip.id, [{ placeId: museum, source: "advisor", category: "see", advisorPlaceId: mine.id }], run.owner);
    const card = (await listTripPlaceCards(trip.id, run.owner, { placeIds: [museum] }))[0];
    expect(card?.yourPlace).toEqual({ advisorPlaceId: mine.id, note: "Mine, for the museum" });
  });

  it("getSharedTripView returns only the traveler projection", async () => {
    const { trip } = await newTrip();
    const uva = f.placeIds[entity("senhor-uva")]!;
    const museum = f.placeIds[entity("gulbenkian")]!;
    const ramiro = f.placeIds[entity("cervejaria")]!;
    const saved = await saveAdvisorPlace(run.owner, { placeId: uva, note: "Advisor eyes only" });
    const ids = await upsertTripPlaces(
      trip.id,
      [
        {
          placeId: uva,
          source: "advisor",
          category: "drink",
          bestScore: 91,
          advisorPlaceId: saved.id,
          explainability: [{ entityId: "e-lilia", name: "Lilia", share: 100 }],
          sharedTags: [{ tagId: "t1", name: "natural wine" }],
          reason: "Natural wine, like Lilia.",
        },
        { placeId: museum, source: "seed", category: "see" },
        { placeId: ramiro, source: "seed", category: "eat" },
      ],
      run.owner,
    );
    await createAsk(trip.id, { label: "Secret ask label" }, run.owner);
    await setSlots(
      trip.id,
      [
        { day: 1, slot: "night", tripPlaceId: ids[uva], note: "Sit at the bar", noteForTraveler: true },
        { day: 1, slot: "lunch", tripPlaceId: ids[museum], note: "Client is slow in the mornings" },
        { day: 2, slot: "dinner", tripPlaceId: ids[ramiro] },
      ],
      "replace",
      run.owner,
    );
    await setTripPlaceStatus(ids[ramiro]!, "removed", run.owner);

    expect(await getSharedTripView("not-a-real-token-at-all")).toBeNull();
    const { shareToken } = await setShareToken(trip.id, run.owner);
    const view = await getSharedTripView(shareToken!);
    expect(view).toMatchObject({ title: "Lisbon for Ana", destinationName: "Lisbon", preparedFor: "Ana" });
    expect(view!.days.map((d) => [d.day, d.date, d.slots.map((s) => [s.slot, s.place?.name, s.advisorNote])])).toEqual([
      [
        1,
        "2026-05-14",
        [
          ["lunch", "Gulbenkian Museum", undefined],
          ["night", "Senhor Uva", "Sit at the bar"],
        ],
      ],
    ]);
    expect(view!.days[0]!.slots[1]!.place).toEqual({
      name: "Senhor Uva",
      category: "drink",
      imageUrl: "https://example.test/uva.jpg",
      neighborhood: undefined,
      because: [{ name: "Lilia", share: 100 }],
      sharedTags: ["natural wine"],
      reason: "Natural wine, like Lilia.",
      images: ["https://example.test/uva.jpg"],
    });
    const json = JSON.stringify(view);
    for (const leak of [trip.id, ids[uva]!, saved.id, "Advisor eyes only", "Client is slow", "Secret ask", "Cervejaria", "e-lilia"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("counts ask results on read and stores the final count when the ask completes", async () => {
    const { trip } = await newTrip();
    const uva = f.placeIds[entity("senhor-uva")]!;
    const museum = f.placeIds[entity("gulbenkian")]!;
    const ids = await upsertTripPlaces(
      trip.id,
      [
        { placeId: uva, source: "ask", category: "drink" },
        { placeId: museum, source: "ask", category: "see" },
      ],
      run.owner,
    );
    const ask = await createAsk(trip.id, { label: "Wine and art" }, run.owner);
    // Two writers at once: neither can leave a stale count behind.
    await Promise.all([
      addAskPlaces(ask.id, [{ tripPlaceId: ids[uva]!, rank: 1 }], run.owner),
      addAskPlaces(ask.id, [{ tripPlaceId: ids[museum]!, rank: 2 }], run.owner),
    ]);
    const [stored] = await db.select().from(tripAsks).where(eq(tripAsks.id, ask.id));
    expect(stored?.resultCount).toBe(0);
    expect((await getTripSnapshot(trip.id, run.owner))!.asks[0]?.resultCount).toBe(2);

    const done = await updateAsk(ask.id, { status: "done", elapsedMs: 900 }, run.owner);
    expect(done.resultCount).toBe(2);
    const [final] = await db.select().from(tripAsks).where(eq(tripAsks.id, ask.id));
    expect(final?.resultCount).toBe(2);
  });

  it("slot writes skip removed places and clearSlot syncs statuses in the same batch", async () => {
    const { trip } = await newTrip();
    const uva = f.placeIds[entity("senhor-uva")]!;
    const museum = f.placeIds[entity("gulbenkian")]!;
    const ids = await upsertTripPlaces(
      trip.id,
      [
        { placeId: uva, source: "seed", category: "drink" },
        { placeId: museum, source: "seed", category: "see" },
      ],
      run.owner,
    );
    await setTripPlaceStatus(ids[museum]!, "removed", run.owner);

    const result = await setSlots(
      trip.id,
      [
        { day: 1, slot: "night", tripPlaceId: ids[uva] },
        { day: 1, slot: "lunch", tripPlaceId: ids[museum] },
        { day: 1, slot: "dinner", tripPlaceId: "not-a-uuid" },
        // Same key twice: the last valid one wins.
        { day: 2, slot: "dinner", tripPlaceId: ids[uva], note: "First" },
        { day: 2, slot: "dinner", tripPlaceId: ids[uva], note: "Second", noteForTraveler: true },
      ],
      "merge",
      run.owner,
    );
    expect(result.applied.map((s) => [s.day, s.slot, s.note, s.noteForTraveler])).toEqual(
      expect.arrayContaining([
        [1, "night", "", false],
        [2, "dinner", "Second", true],
      ]),
    );
    expect(result.applied).toHaveLength(2);
    expect(result.rejected).toEqual([
      { tripPlaceId: ids[museum], reason: "This place was removed from the trip." },
      { tripPlaceId: "not-a-uuid", reason: "This place is not on this trip." },
    ]);
    await expect(upsertSlot(trip.id, { day: 3, slot: "lunch", tripPlaceId: ids[museum] }, run.owner)).rejects.toThrow(
      "This place was removed from the trip.",
    );

    // An empty note in merge mode keeps the stored note and its flag.
    const merged = await setSlots(trip.id, [{ day: 2, slot: "dinner", tripPlaceId: ids[uva] }], "merge", run.owner);
    expect(merged.applied[0]).toMatchObject({ note: "Second", noteForTraveler: true });

    const status = async () => (await db.select().from(tripPlaces).where(eq(tripPlaces.id, ids[uva]!)))[0]?.status;
    expect(await status()).toBe("added");
    const slots = await db.select().from(itinerarySlots).where(eq(itinerarySlots.tripId, trip.id));
    const night = slots.find((s) => s.slot === "night")!;
    const dinner = slots.find((s) => s.slot === "dinner")!;

    await expect(clearSlot(night.id, run.otherOwner)).rejects.toThrow("No slot with that id.");
    await clearSlot(night.id, run.owner);
    expect(await status()).toBe("added"); // still in the day 2 dinner slot
    await clearSlot(dinner.id, run.owner);
    expect(await status()).toBe("suggested");
  });

  it("createTrip reads the client name inside the insert", async () => {
    const lea = await createClient({ name: "Lea Park" }, run.owner);
    const [{ trip }] = await Promise.all([
      createTrip(run.owner, { ...baseInput(), clientId: lea.id }),
      updateClientFields(lea.id, { name: "Lea Parker" }, run.owner),
    ]);
    // Whichever finished first, the stored name and search match the client now.
    const after = await getTrip(trip.id, run.owner);
    expect(after?.clientName).toBe("Lea Parker");
    expect(after?.search).toContain("Lea Parker");
  });

  it("listTrips pages each stage and agrees with computeStage", async () => {
    const owner = `${run.owner}-board`;
    const client = await createClient({ name: "Board Client" }, owner);
    try {
      const planned: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const { trip } = await createTrip(owner, {
          ...baseInput(),
          clientId: client.id,
          startDate: "2099-01-01",
          endDate: "2099-01-03",
          datesMode: "exact",
        });
        planned.push(trip.id);
      }
      const { trip: past } = await createTrip(owner, {
        ...baseInput(),
        clientId: client.id,
        startDate: "2020-01-01",
        endDate: "2020-01-02",
        datesMode: "exact",
      });
      const uva = f.placeIds[entity("senhor-uva")]!;
      const tp = await upsertTripPlaces(past.id, [{ placeId: uva, source: "seed", category: "drink", bestScore: 80 }], owner);
      await setSlots(past.id, [{ day: 1, slot: "night", tripPlaceId: tp[uva] }], "replace", owner);

      const first = await listTrips(owner, { perStage: 2 });
      expect(first.planning).toMatchObject({ total: 3, hasMore: true });
      expect(first.planning.trips.map((t) => t.id)).toEqual([planned[2], planned[1]]);
      expect(first.done).toMatchObject({ total: 1, hasMore: false });
      expect(first.done.trips[0]).toMatchObject({
        id: past.id,
        stage: "done",
        imageUrl: "https://example.test/uva.jpg",
        counts: { places: 1, added: 1, filledSlots: 1, days: 2, emptyDays: 1 },
      });

      const next = await listTrips(owner, { perStage: 2, offset: 2 });
      expect(next.planning.trips.map((t) => t.id)).toEqual([planned[0]]);
      expect(next.planning.hasMore).toBe(false);

      // The SQL stage and computeStage agree for every card.
      const all = await listTrips(owner);
      for (const column of Object.values(all)) {
        for (const card of column.trips) {
          const t = await getTrip(card.id, owner);
          expect(card.stage).toBe(computeStage(t!));
        }
      }
      expect(Object.values(await listTrips(run.otherOwner)).every((c) => c.trips.length === 0)).toBe(true);
    } finally {
      await db.delete(trips).where(eq(trips.ownerId, owner));
      await db.delete(chats).where(eq(chats.ownerId, owner));
      await db.delete(clients).where(eq(clients.ownerId, owner));
    }
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
