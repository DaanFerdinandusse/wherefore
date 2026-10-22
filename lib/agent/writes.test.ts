import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient } from "@/lib/clients";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { chats, tripAsks, tripPlaces, trips } from "@/lib/db/schema";
import { upsertPlaces } from "@/lib/places";
import { createAsk, createTrip, upsertTripPlaces } from "@/lib/trips";

import {
  finishAsk,
  guarded,
  holdsTurn,
  markSeedFailed,
  TurnSupersededError,
  writeReasons,
  writeSeedState,
  type TurnRef,
} from "./writes";

// Every tool write lands only while its turn holds the chat lock.

const run = testRun();
let turn: TurnRef;
let stale: TurnRef;
let tripPlaceId: string;
let askId: string;

async function lockChat(turnId: string | null) {
  await db.update(chats).set({ activeTurnId: turnId }).where(eq(chats.id, turn.chatId));
}

describe.skipIf(!hasDatabase)("lib/agent/writes", () => {
  beforeAll(async () => {
    const client = await createClient({ name: "Writes Test" }, run.owner);
    const created = await createTrip(run.owner, {
      clientId: client.id,
      destination: LISBON,
      datesMode: "unset",
      adults: 1,
      children: 0,
      travelers: [],
    });
    turn = { chatId: created.chatId, tripId: created.trip.id, turnId: randomUUID() };
    stale = { ...turn, turnId: randomUUID() };
    await lockChat(turn.turnId);
    const placeIds = await upsertPlaces([{ entityId: `${run.entityPrefix}uva`, name: "Senhor Uva" }]);
    const placeId = placeIds[`${run.entityPrefix}uva`] as string;
    const ids = await upsertTripPlaces(turn.tripId, [{ placeId, source: "ask", category: "drink" }], run.owner);
    tripPlaceId = ids[placeId] as string;
    askId = (await createAsk(turn.tripId, { label: "Natural wine · Sat", toolCallId: `call-${run.entityPrefix}` }, run.owner)).id;
  });

  afterAll(async () => {
    await cleanup(run);
  });

  it("knows which turn holds the lock", async () => {
    expect(await holdsTurn(turn)).toBe(true);
    expect(await holdsTurn(stale)).toBe(false);
  });

  it("writes reasons only for the turn that holds the lock", async () => {
    expect(await writeReasons(stale, [{ tripPlaceId, reason: "Stale reason." }])).toBe(0);
    expect(await writeReasons(turn, [{ tripPlaceId, reason: "Natural wine like Via Carota." }])).toBe(1);
    // Keyed by trip place: a replay writes the same row again.
    expect(await writeReasons(turn, [{ tripPlaceId, reason: "Natural wine like Via Carota." }])).toBe(1);
    const [row] = await db.select({ reason: tripPlaces.reason }).from(tripPlaces).where(eq(tripPlaces.id, tripPlaceId));
    expect(row?.reason).toBe("Natural wine like Via Carota.");
  });

  it("never writes a reason onto another trip's place", async () => {
    const otherTrip = { ...turn, tripId: randomUUID() };
    expect(await writeReasons(otherTrip, [{ tripPlaceId, reason: "Nope." }])).toBe(0);
  });

  it("finishes an ask and the seed state only under the lock", async () => {
    expect(await finishAsk(stale, askId, { status: "done", elapsedMs: 1400, loosened: [] })).toBe(false);
    expect(await finishAsk(turn, askId, { status: "done", elapsedMs: 1400, loosened: ["price"], resultCount: 12 })).toBe(true);
    const [ask] = await db.select().from(tripAsks).where(eq(tripAsks.id, askId));
    expect(ask).toMatchObject({ status: "done", elapsedMs: 1400, resultCount: 12, loosened: ["price"] });

    expect(await writeSeedState(stale, { seedStatus: "running" })).toBe(false);
    expect(await writeSeedState(turn, { seedStatus: "running" })).toBe(true);
  });

  it("guarded throws a non-retryable error once the turn lost the lock", async () => {
    await expect(guarded(stale, async () => "written")).rejects.toBeInstanceOf(TurnSupersededError);
    await expect(guarded(turn, async () => "written")).resolves.toBe("written");
  });

  it("marks a stopped seed failed, but never a seed a newer turn runs", async () => {
    // A newer turn holds the lock: the stale seed may not mark it failed.
    await lockChat(stale.turnId);
    await db.update(trips).set({ seedStatus: "running" }).where(eq(trips.id, turn.tripId));
    expect(await markSeedFailed(turn)).toBe(false);
    // The lock was released (the turn was stopped): a running seed becomes failed.
    await lockChat(null);
    expect(await markSeedFailed(turn)).toBe(true);
    const [trip] = await db.select({ seedStatus: trips.seedStatus }).from(trips).where(eq(trips.id, turn.tripId));
    expect(trip?.seedStatus).toBe("failed");
    await lockChat(turn.turnId);
  });
});
