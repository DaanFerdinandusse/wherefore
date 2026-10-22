import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import type { AppUIMessage } from "@/lib/contracts";
import { cleanup, hasDatabase, testRun } from "@/lib/db/__tests__/fixtures";

import {
  createChatForTrip,
  getChat,
  getTurn,
  markPendingSave,
  releaseTurn,
  requestStop,
  savePendingMessage,
  saveTurnMessage,
  setActiveRun,
  takeTurnLock,
} from "../chat-store";

// The chat-store conditional updates against the Neon branch: the turn lock
// with its resend rule and turn record, the release that finalizes the
// record, and the pending save record.

const run = testRun();

const user = (id: string, text: string, turnId?: string): AppUIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
  metadata: turnId ? { turnId, kind: "turn" } : undefined,
});
const reply = (turnId: string, text: string): AppUIMessage => ({
  id: `a-${turnId}`,
  role: "assistant",
  parts: [{ type: "text", text, state: "done" }],
  metadata: { turnId, kind: "turn" },
});

async function newChat(): Promise<string> {
  return (await createChatForTrip(randomUUID(), run.owner)).id;
}

/** One full turn: lock, run id, saved reply, release. */
async function answer(chatId: string, turnId: string, message: AppUIMessage, text: string) {
  expect(await takeTurnLock(chatId, turnId, message)).toBe(true);
  expect(await setActiveRun(chatId, turnId, `run-${turnId}`)).toBe(true);
  expect(await saveTurnMessage(chatId, turnId, reply(turnId, text))).toBe(true);
  expect(await releaseTurn(chatId, turnId, { status: "idle" })).toBe(true);
}

afterAll(async () => {
  if (hasDatabase) await cleanup(run);
});

describe.skipIf(!hasDatabase)("chat-store turn lock", () => {
  it("takes the lock, appends the message and records the turn in one statement", async () => {
    const chatId = await newChat();
    const turnId = randomUUID();
    expect(await takeTurnLock(chatId, turnId, user("u1", "hi", turnId))).toBe(true);
    const chat = await getChat(chatId);
    expect(chat).toMatchObject({ status: "running", activeTurnId: turnId, activeRunId: null });
    expect(chat?.messages.map((m) => m.id)).toEqual(["u1"]);
    expect(await getTurn(turnId)).toMatchObject({ chatId, status: "running", runId: null });

    expect(await setActiveRun(chatId, turnId, "run-1")).toBe(true);
    expect((await getTurn(turnId))?.runId).toBe("run-1");

    // Another turn while this one runs: no lock, no record.
    const other = randomUUID();
    expect(await takeTurnLock(chatId, other, user("u2", "again", other))).toBe(false);
    expect(await getTurn(other)).toBeUndefined();
  });

  it("a finished turnId never takes the lock again, so its answer is never truncated", async () => {
    const chatId = await newChat();
    const turnId = randomUUID();
    await answer(chatId, turnId, user("u1", "hi", turnId), "hello");
    expect(await getTurn(turnId)).toMatchObject({ status: "completed", runId: `run-${turnId}` });
    expect((await getTurn(turnId))?.finishedAt).toBeInstanceOf(Date);

    expect(await takeTurnLock(chatId, turnId, user("u1", "hi", turnId))).toBe(false);
    const chat = await getChat(chatId);
    expect(chat?.status).toBe("idle");
    expect(chat?.messages.map((m) => m.id)).toEqual(["u1", `a-${turnId}`]);
  });

  it("checks the resend rule inside the statement: only the last user message can be re-sent", async () => {
    const chatId = await newChat();
    const t1 = randomUUID();
    const t2 = randomUUID();
    await answer(chatId, t1, user("u1", "first", t1), "one");
    await answer(chatId, t2, user("u2", "second", t2), "two");

    // A stale client re-sending u1 would cut the answered u2: refused.
    expect(await takeTurnLock(chatId, randomUUID(), user("u1", "first"))).toBe(false);
    expect((await getChat(chatId))?.messages.map((m) => m.id)).toEqual(["u1", `a-${t1}`, "u2", `a-${t2}`]);

    // Retry of the last user message: the reply after it goes, the message is replaced, not duplicated.
    const retry = randomUUID();
    expect(await takeTurnLock(chatId, retry, user("u2", "second", retry))).toBe(true);
    const chat = await getChat(chatId);
    expect(chat?.messages.map((m) => m.id)).toEqual(["u1", `a-${t1}`, "u2"]);
    expect(chat?.messages.at(-1)?.metadata?.turnId).toBe(retry);
  });
});

describe.skipIf(!hasDatabase)("chat-store release", () => {
  it("records stopped when a stop was requested, and never touches a newer turn", async () => {
    const chatId = await newChat();
    const turnId = randomUUID();
    expect(await takeTurnLock(chatId, turnId, user("u1", "hi", turnId))).toBe(true);
    expect(await requestStop(chatId)).toEqual({ turnId, runId: null });
    expect(await releaseTurn(chatId, "not-the-turn", { status: "idle" })).toBe(false);
    expect((await getChat(chatId))?.activeTurnId).toBe(turnId);

    expect(await releaseTurn(chatId, turnId, { status: "idle" })).toBe(true);
    expect(await getTurn(turnId)).toMatchObject({ status: "stopped" });
    expect(await getChat(chatId)).toMatchObject({ status: "idle", activeTurnId: null, stopRequestedAt: null });
  });

  it("records failed with its error", async () => {
    const chatId = await newChat();
    const turnId = randomUUID();
    expect(await takeTurnLock(chatId, turnId, user("u1", "hi", turnId))).toBe(true);
    expect(await releaseTurn(chatId, turnId, { status: "failed", lastError: "Model down." })).toBe(true);
    expect(await getTurn(turnId)).toMatchObject({ status: "failed", error: "Model down." });
    expect(await getChat(chatId)).toMatchObject({ status: "failed", lastError: "Model down." });
  });
});

describe.skipIf(!hasDatabase)("chat-store pending save", () => {
  it("is written only while the turn holds the lock, survives the release, and is cleared by the save", async () => {
    const chatId = await newChat();
    const t1 = randomUUID();
    expect(await takeTurnLock(chatId, t1, user("u1", "hi", t1))).toBe(true);
    expect(await markPendingSave(chatId, "other-turn", "run-x")).toBe(false);
    expect(await markPendingSave(chatId, t1, `run-${t1}`)).toBe(true);
    expect(await releaseTurn(chatId, t1, { status: "idle" })).toBe(true);
    expect(await getChat(chatId)).toMatchObject({ pendingRunId: `run-${t1}`, pendingTurnId: t1, activeTurnId: null });

    // A later turn started before the pending reply was rebuilt.
    const t2 = randomUUID();
    expect(await takeTurnLock(chatId, t2, user("u2", "next", t2))).toBe(true);

    expect(await savePendingMessage(chatId, "run-wrong", reply(t1, "late"))).toBe(false);
    expect(await savePendingMessage(chatId, `run-${t1}`, reply(t1, "late"))).toBe(true);
    const chat = await getChat(chatId);
    // The rebuilt reply lands right after its own user message.
    expect(chat?.messages.map((m) => m.id)).toEqual(["u1", `a-${t1}`, "u2"]);
    expect(chat).toMatchObject({ pendingRunId: null, pendingTurnId: null, pendingSince: null, activeTurnId: t2 });
  });

  it("release can write the pending record in the same statement", async () => {
    const chatId = await newChat();
    const turnId = randomUUID();
    expect(await takeTurnLock(chatId, turnId, user("u1", "hi", turnId))).toBe(true);
    expect(await releaseTurn(chatId, turnId, { status: "idle", outcome: "completed", pendingRunId: "run-p" })).toBe(true);
    expect(await getChat(chatId)).toMatchObject({ pendingRunId: "run-p", pendingTurnId: turnId, activeTurnId: null });
    expect((await getChat(chatId))?.pendingSince).toBeInstanceOf(Date);
  });
});
