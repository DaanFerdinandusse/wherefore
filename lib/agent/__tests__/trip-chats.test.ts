import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient } from "@/lib/clients";
import type { AppUIMessage } from "@/lib/contracts";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { chats } from "@/lib/db/schema";
import { createTrip } from "@/lib/trips";

import {
  createTripChat,
  getChat,
  getTripChat,
  listChatsForTrips,
  listTripChats,
  releaseTurn,
  takeTurnLock,
} from "../chat-store";

// Several chats per trip against the Neon branch: the title set with the
// first turn's lock, the trip's chat list, the default chat and creation.

const run = testRun();
let tripId: string;
let firstChatId: string;

const user = (id: string, text: string, metadata?: AppUIMessage["metadata"]): AppUIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
  ...(metadata ? { metadata } : {}),
});

async function turn(chatId: string, message: AppUIMessage) {
  const turnId = randomUUID();
  expect(await takeTurnLock(chatId, turnId, message)).toBe(true);
  expect(await releaseTurn(chatId, turnId, { status: "idle" })).toBe(true);
}

beforeAll(async () => {
  if (!hasDatabase) return;
  const client = await createClient({ name: "Chats Test" }, run.owner);
  const created = await createTrip(run.owner, {
    clientId: client.id,
    destination: LISBON,
    datesMode: "unset",
    adults: 1,
    children: 0,
    travelers: [],
  });
  tripId = created.trip.id;
  firstChatId = created.chatId;
});

afterAll(async () => {
  if (hasDatabase) await cleanup(run);
});

describe.skipIf(!hasDatabase)("chat-store: several chats per trip", () => {
  it("titles a chat from the first visible advisor message, once", async () => {
    await turn(firstChatId, user("seed", "Seed brief", { hidden: true, kind: "seed" }));
    expect((await getChat(firstChatId))?.title).toBeNull();
    await turn(firstChatId, user("u1", "Day 2 lunch, somewhere lively"));
    await turn(firstChatId, user("u2", "Something else"));
    expect((await getChat(firstChatId))?.title).toBe("Day 2 lunch, somewhere lively");
  });

  it("creates an empty chat, and reuses it instead of making a second blank one", async () => {
    const created = await createTripChat(tripId, run.owner);
    expect(created).toMatchObject({ tripId, title: null });
    const again = await createTripChat(tripId, run.owner);
    expect(again?.id).toBe(created?.id);
    expect((await listTripChats(tripId, run.owner)).map((c) => c.id)).toEqual([created?.id, firstChatId]);
  });

  it("opens the chat asked for, else the most recently active one", async () => {
    const list = await listTripChats(tripId, run.owner);
    const [newest, older] = list;
    expect((await getTripChat(tripId, undefined, run.owner))?.id).toBe(newest?.id);
    expect((await getTripChat(tripId, older?.id, run.owner))?.id).toBe(older?.id);
    // A turn in the older chat makes it the default.
    await turn(firstChatId, user("u3", "Back to this one"));
    expect((await getTripChat(tripId, undefined, run.owner))?.id).toBe(firstChatId);
  });

  it("keeps chats inside the trip and the owner", async () => {
    const otherTrip = randomUUID();
    const [foreign] = await db.insert(chats).values({ tripId: otherTrip, ownerId: run.owner }).returning();
    expect(await getTripChat(tripId, foreign?.id, run.owner)).toBeUndefined();
    expect(await getTripChat(tripId, firstChatId, run.otherOwner)).toBeUndefined();
    expect(await listTripChats(tripId, run.otherOwner)).toEqual([]);
    expect(await createTripChat(tripId, run.otherOwner)).toBeUndefined();
    expect(await getTripChat(tripId, "not-a-uuid", run.owner)).toBeUndefined();
    const grouped = await listChatsForTrips([tripId, otherTrip], run.owner);
    // The chat of a trip that does not exist (not in scope) is left out.
    expect(grouped.every((c) => c.tripId === tripId)).toBe(true);
    if (foreign) await db.delete(chats).where(eq(chats.id, foreign.id));
  });
});
