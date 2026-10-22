import { describe, expect, it, vi } from "vitest";

import type { ChatSnapshot } from "@/lib/contracts";

import { kickOffSeed, seedStorageKey, shouldKickOff, type SeedStorage } from "./seed";

function memoryStorage(): SeedStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const chat: ChatSnapshot["chat"] = { id: "chat-1", tripId: "trip-1", status: "idle", messages: [] };
let counter = 0;
const newId = () => `id-${++counter}`;

describe("seed kick-off", () => {
  it("only starts on a pending trip with an idle chat", () => {
    expect(shouldKickOff({ seedStatus: "pending", chatId: "chat-1" }, chat)).toBe(true);
    expect(shouldKickOff({ seedStatus: "running", chatId: "chat-1" }, chat)).toBe(false);
    expect(shouldKickOff({ seedStatus: "pending", chatId: "chat-1" }, { ...chat, status: "running" })).toBe(false);
    expect(shouldKickOff({ seedStatus: "pending", chatId: "chat-1" }, { ...chat, activeTurnId: "t" })).toBe(false);
  });

  it("posts the hidden seed message once per tab", async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn(async () => new Response("stream", { status: 200 }));
    expect(await kickOffSeed({ chatId: "chat-1", fetchImpl, storage, newId })).toBe("started");
    expect(await kickOffSeed({ chatId: "chat-1", fetchImpl, storage, newId })).toBe("skipped");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/chats/chat-1/messages");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.turnId).toEqual(expect.any(String));
    expect(body.message).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "Set up the trip" }],
      metadata: { hidden: true, kind: "seed" },
    });
    expect(body.message.id).not.toBe(body.turnId);
  });

  it("treats a 409 as a turn already running", async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn(async () => Response.json({ error: { code: "conflict" } }, { status: 409 }));
    expect(await kickOffSeed({ chatId: "chat-1", fetchImpl, storage, newId })).toBe("busy");
    expect(storage.data.has(seedStorageKey("chat-1"))).toBe(true);
  });

  it("fails on a missing route or a network error and lets Retry post again", async () => {
    const storage = memoryStorage();
    const missing = vi.fn(async () => new Response("", { status: 404 }));
    expect(await kickOffSeed({ chatId: "chat-1", fetchImpl: missing, storage, newId })).toBe("failed");
    expect(storage.data.size).toBe(0);

    const offline = vi.fn(async () => {
      throw new TypeError("network");
    });
    expect(await kickOffSeed({ chatId: "chat-1", fetchImpl: offline, storage, newId })).toBe("failed");

    const ok = vi.fn(async () => new Response("", { status: 200 }));
    storage.setItem(seedStorageKey("chat-1"), "earlier");
    expect(await kickOffSeed({ chatId: "chat-1", fetchImpl: ok, storage, newId, force: true })).toBe("started");
  });
});
