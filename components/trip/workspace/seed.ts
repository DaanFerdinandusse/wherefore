// The seed kick-off: the trip's first chat turn ("Set up the trip", hidden,
// kind seed) is posted once when the workspace opens on a pending trip and an
// idle chat. A ref guards React's double effects and sessionStorage guards a
// reload, so one tab posts at most once per chat. A 409 means a turn is
// already running (the create action or another tab started it): fine, the
// poll picks up its progress. Pure apart from the injected fetch and storage.

import type { AppUIMessage, ChatSnapshot, TripSnapshot } from "@/lib/contracts";

export const SEED_PROMPT = "Set up the trip";
export const SEED_POLL_MS = 3000;
/** About five minutes of polling without an answer reads as a failed seed. */
export const SEED_POLL_LIMIT = 100;

export const seedStorageKey = (chatId: string) => `tastebrief.seed.${chatId}`;

export type SeedStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SeedRequestBody = { turnId: string; message: AppUIMessage };

export function isSeeding(status: TripSnapshot["trip"]["seedStatus"]): boolean {
  return status === "pending" || status === "running";
}

export function shouldKickOff(trip: Pick<TripSnapshot["trip"], "seedStatus" | "chatId">, chat: ChatSnapshot["chat"]): boolean {
  return trip.seedStatus === "pending" && !!trip.chatId && chat.status === "idle" && !chat.activeTurnId;
}

export function seedRequestBody(newId: () => string): SeedRequestBody {
  return {
    turnId: newId(),
    message: {
      id: newId(),
      role: "user",
      parts: [{ type: "text", text: SEED_PROMPT }],
      metadata: { hidden: true, kind: "seed" },
    },
  };
}

export type KickOffResult =
  /** This tab already posted the seed for this chat. */
  | "skipped"
  | "started"
  /** 409: a turn is already running for this chat. */
  | "busy"
  | "failed";

export async function kickOffSeed({
  chatId,
  fetchImpl,
  storage,
  newId,
  force = false,
}: {
  chatId: string;
  fetchImpl: typeof fetch;
  storage: SeedStorage | null;
  newId: () => string;
  /** Retry: post again even if this tab posted before. */
  force?: boolean;
}): Promise<KickOffResult> {
  const key = seedStorageKey(chatId);
  if (!force && safeGet(storage, key)) return "skipped";
  safeSet(storage, key, new Date().toISOString());

  let response: Response;
  try {
    response = await fetchImpl(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(seedRequestBody(newId)),
    });
  } catch {
    safeRemove(storage, key);
    return "failed";
  }
  // The answer is the turn's UI stream. The run keeps going on the server
  // without a reader (the dock re-attaches to it), so the body is released.
  void response.body?.cancel().catch(() => undefined);
  if (response.status === 409) return "busy";
  if (!response.ok) {
    safeRemove(storage, key);
    return "failed";
  }
  return "started";
}

function safeGet(storage: SeedStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage: SeedStorage | null, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Private mode or a full quota: the ref still guards this mount.
  }
}

function safeRemove(storage: SeedStorage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // See safeSet.
  }
}
