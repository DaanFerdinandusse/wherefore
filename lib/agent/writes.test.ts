import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient } from "@/lib/clients";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { askPlaces, chats, tripAsks, tripCalls, tripPlaces, trips } from "@/lib/db/schema";
import { upsertPlaces } from "@/lib/places";
import {
  addAskPlaces,
  createAsk,
  createTrip,
  logTripCall,
  setTripPlaceStatus,
  TurnLostError,
  updateAsk,
  upsertTripPlaces,
} from "@/lib/trips";

import { releaseTurn } from "./chat-store";
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
let placeId: string;
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
    placeId = placeIds[`${run.entityPrefix}uva`] as string;
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

  it("writes the tagged drivers with the reason, and keeps what a row leaves out", async () => {
    const drivers = [{ entityId: "e-via", name: "Via Carota", share: 100, tags: ["Italian", "Warm"] }];
    expect(await writeReasons(turn, [{ tripPlaceId, explainability: drivers }])).toBe(1);
    const read = async () =>
      (await db.select({ reason: tripPlaces.reason, drivers: tripPlaces.explainability }).from(tripPlaces).where(eq(tripPlaces.id, tripPlaceId)))[0];
    expect(await read()).toEqual({ reason: "Natural wine like Via Carota.", drivers });
    expect(await writeReasons(stale, [{ tripPlaceId, explainability: [] }])).toBe(0);
    expect(await writeReasons(turn, [{ tripPlaceId, reason: "Like Via Carota: Italian and warm." }])).toBe(1);
    expect(await read()).toEqual({ reason: "Like Via Carota: Italian and warm.", drivers });
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

  it("guarded turns a write the guard blocked into a non-retryable error", async () => {
    const row = [{ placeId, source: "ask" as const, category: "drink" as const }];
    await expect(
      guarded(stale, (guard) => upsertTripPlaces(turn.tripId, row, run.owner, { turn: guard })),
    ).rejects.toBeInstanceOf(TurnSupersededError);
    await expect(guarded(turn, (guard) => upsertTripPlaces(turn.tripId, row, run.owner, { turn: guard }))).resolves.toEqual({
      [placeId]: tripPlaceId,
    });
  });

  it("drops every tool write once Stop was requested, inside the write statement", async () => {
    const guard = { chatId: turn.chatId, turnId: turn.turnId };
    await db.update(chats).set({ stopRequestedAt: new Date() }).where(eq(chats.id, turn.chatId));
    try {
      expect(await holdsTurn(turn)).toBe(false);
      expect(await writeReasons(turn, [{ tripPlaceId, reason: "After stop." }])).toBe(0);
      await expect(
        upsertTripPlaces(turn.tripId, [{ placeId, source: "ask", category: "drink" }], run.owner, { turn: guard }),
      ).rejects.toBeInstanceOf(TurnLostError);
      await expect(
        createAsk(turn.tripId, { label: "After stop", toolCallId: `call-stop-${run.entityPrefix}` }, run.owner, { turn: guard }),
      ).rejects.toBeInstanceOf(TurnLostError);
      await expect(updateAsk(askId, { label: "Renamed" }, run.owner, { turn: guard })).rejects.toBeInstanceOf(TurnLostError);
      await expect(addAskPlaces(askId, [{ tripPlaceId, rank: 1 }], run.owner, { turn: guard })).rejects.toBeInstanceOf(
        TurnLostError,
      );
      await expect(
        logTripCall(turn.tripId, { endpoint: "/v2/insights" }, run.owner, { turn: guard }),
      ).rejects.toBeInstanceOf(TurnLostError);
      await expect(setTripPlaceStatus(tripPlaceId, "removed", run.owner, { turn: guard })).rejects.toBeInstanceOf(
        TurnLostError,
      );
      const [tp] = await db.select({ status: tripPlaces.status, reason: tripPlaces.reason }).from(tripPlaces).where(eq(tripPlaces.id, tripPlaceId));
      expect(tp?.status).toBe("suggested");
      expect(tp?.reason).not.toBe("After stop.");
      const asks = await db.select().from(tripAsks).where(eq(tripAsks.toolCallId, `call-stop-${run.entityPrefix}`));
      expect(asks).toHaveLength(0);
    } finally {
      await db.update(chats).set({ stopRequestedAt: null }).where(eq(chats.id, turn.chatId));
    }
  });

  it("keys call logs by tool call, step and index, so a retried step rewrites them", async () => {
    const guard = { chatId: turn.chatId, turnId: turn.turnId };
    const key = { toolCallId: `call-log-${run.entityPrefix}`, step: "search", index: 0 };
    await logTripCall(turn.tripId, { endpoint: "/v2/insights", count: 3, key }, run.owner, { turn: guard });
    await logTripCall(turn.tripId, { endpoint: "/v2/insights", count: 5, key }, run.owner, { turn: guard });
    const rows = await db.select().from(tripCalls).where(eq(tripCalls.toolCallId, key.toolCallId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(5);
  });

  it("makes an ask's result set authoritative with replace", async () => {
    const guard = { chatId: turn.chatId, turnId: turn.turnId };
    const placeIds = await upsertPlaces([{ entityId: `${run.entityPrefix}extra`, name: "Extra" }]);
    const extraPlaceId = placeIds[`${run.entityPrefix}extra`] as string;
    const ids = await upsertTripPlaces(turn.tripId, [{ placeId: extraPlaceId, source: "ask", category: "drink" }], run.owner);
    const extraId = ids[extraPlaceId] as string;
    await addAskPlaces(askId, [{ tripPlaceId, rank: 1 }, { tripPlaceId: extraId, rank: 2 }], run.owner, { turn: guard });
    await addAskPlaces(askId, [{ tripPlaceId, rank: 1 }], run.owner, { turn: guard, replace: true });
    const members = await db.select().from(askPlaces).where(eq(askPlaces.askId, askId));
    expect(members.map((m) => m.tripPlaceId)).toEqual([tripPlaceId]);
  });

  it("finishes the turn's running asks and a running seed when the turn is released", async () => {
    const turnId = randomUUID();
    const t2: TurnRef = { ...turn, turnId };
    const guard = { chatId: turn.chatId, turnId };
    await lockChat(turnId);
    const withPlaces = await createAsk(turn.tripId, { label: "Stopped with places", toolCallId: `call-a-${turnId}` }, run.owner, { turn: guard });
    const empty = await createAsk(turn.tripId, { label: "Stopped empty", toolCallId: `call-b-${turnId}` }, run.owner, { turn: guard });
    await addAskPlaces(withPlaces.id, [{ tripPlaceId, rank: 1 }], run.owner, { turn: guard });
    expect(await writeSeedState(t2, { seedStatus: "running" })).toBe(true);

    expect(await releaseTurn(turn.chatId, turnId, { status: "idle" })).toBe(true);

    const rows = await db.select().from(tripAsks).where(eq(tripAsks.turnId, turnId));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(withPlaces.id)).toMatchObject({ status: "done", resultCount: 1 });
    expect(byId.get(empty.id)).toMatchObject({ status: "failed", resultCount: 0 });
    const [trip] = await db.select({ seedStatus: trips.seedStatus }).from(trips).where(eq(trips.id, turn.tripId));
    expect(trip?.seedStatus).toBe("failed");
    await lockChat(turn.turnId);
  });

  it("marks a seed failed after Stop while the stopped turn still holds the lock", async () => {
    await db.update(trips).set({ seedStatus: "running" }).where(eq(trips.id, turn.tripId));
    await db.update(chats).set({ stopRequestedAt: new Date() }).where(eq(chats.id, turn.chatId));
    try {
      expect(await markSeedFailed(turn)).toBe(true);
    } finally {
      await db.update(chats).set({ stopRequestedAt: null }).where(eq(chats.id, turn.chatId));
    }
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
