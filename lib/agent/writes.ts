import "server-only";

import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { FatalError } from "workflow";

import type { BuiltFrom, Explainability, TripSnapshot } from "@/lib/contracts";
import { db } from "@/lib/db";
import { chats, tripAsks, tripPlaces, trips } from "@/lib/db/schema";
import { TurnLostError, turnGuardSql, type TurnGuard } from "@/lib/trips/turn-guard";

// Every write an agent tool makes goes through here. Two rules (PLAN 6.1):
//
// 1. A write only lands while the turn that made it still holds the chat's
//    lock (chats.active_turn_id = turnId) and no stop was requested
//    (stop_requested_at is null). A stopped or superseded run can never
//    touch the board, not even the board of its own turn after Stop.
// 2. A write is idempotent by key: asks by toolCallId, trip places by
//    (trip, place), ask places by (ask, trip place), reasons by trip place.
//    Workflow retries a failed step from the top, so a replay rewrites the
//    same rows instead of adding new ones.
//
// The check is part of every write statement, never a read before it: the
// writes owned here (reasons, ask status, seed state) carry `turnHolds` in
// their WHERE, and the lib/trips writes (trip places, asks, ask places,
// slots, call logs, replacements) take the turn as `{ turn }` and put the
// same guard into their insert or update (lib/trips/turn-guard.ts). `guarded`
// hands them the guard and turns a blocked write into TurnSupersededError.
//
// Two writes are caches, not trip state, and keep a check right before the
// write (`cacheWrite`): the shared places cache (lib/places) and a client's
// taste tags (lib/clients). A stop in between can at most refresh a cache.

/** The turn a tool step runs for. Serializable: it crosses the step boundary. */
export type TurnRef = { chatId: string; tripId: string; turnId: string };

/** The lock moved on: the turn was stopped or a newer turn started. Never retried. */
export class TurnSupersededError extends FatalError {
  constructor() {
    super("This reply was stopped or replaced by a newer one, so its changes were not saved.");
    this.name = "TurnSupersededError";
  }
}

/** The lib/trips guard for this turn. */
export function guardOf(turn: TurnRef): TurnGuard {
  return { chatId: turn.chatId, turnId: turn.turnId };
}

/**
 * `exists (chat of this trip whose lock is this turn, no stop requested)`,
 * for a WHERE clause. Takes a share lock on the chat row (turn-guard.ts).
 */
export function turnHolds(turn: TurnRef): SQL {
  return turnGuardSql(guardOf(turn), turn.tripId);
}

/** True while the turn holds its chat's lock and no stop was requested. */
export async function holdsTurn(turn: TurnRef): Promise<boolean> {
  const rows = await db
    .select({ id: chats.id })
    .from(chats)
    .where(
      and(
        eq(chats.id, turn.chatId),
        eq(chats.tripId, turn.tripId),
        eq(chats.activeTurnId, turn.turnId),
        isNull(chats.stopRequestedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** @throws TurnSupersededError when the turn no longer holds the lock. */
export async function assertTurn(turn: TurnRef): Promise<void> {
  if (!(await holdsTurn(turn))) throw new TurnSupersededError();
}

/**
 * Runs a lib/trips write with this turn's guard inside its statement. The
 * write must pass the guard on (`{ turn: guard }`) and be a keyed upsert.
 * @throws TurnSupersededError when the guard blocked the write.
 */
export async function guarded<T>(turn: TurnRef, write: (guard: TurnGuard) => Promise<T>): Promise<T> {
  try {
    return await write(guardOf(turn));
  } catch (error) {
    if (error instanceof TurnLostError) throw new TurnSupersededError();
    throw error;
  }
}

/**
 * A cache write (the places cache, a client's taste tags) checked right
 * before it runs. Only for writes that are not trip state; see the top.
 */
export async function cacheWrite<T>(turn: TurnRef, write: () => Promise<T>): Promise<T> {
  await assertTurn(turn);
  return write();
}

/**
 * Stores grounded reason sentences and the drivers with their taste tags on
 * trip places of this trip. One statement, conditional on the lock. Keyed by
 * trip place: a replay writes the same text again. What a row leaves out
 * stays as it is.
 * @returns how many trip places were updated (0 when the turn lost its lock).
 */
export async function writeReasons(
  turn: TurnRef,
  reasons: { tripPlaceId: string; reason?: string; explainability?: Explainability }[],
): Promise<number> {
  if (reasons.length === 0) return 0;
  const rows = await db
    .update(tripPlaces)
    .set({
      reason: sql`coalesce(r.reason, ${tripPlaces.reason})`,
      explainability: sql`coalesce(r.explainability, ${tripPlaces.explainability})`,
      updatedAt: sql`now()`,
    })
    .from(sql`jsonb_to_recordset(${JSON.stringify(reasons)}::jsonb) as r("tripPlaceId" uuid, reason text, explainability jsonb)`)
    .where(and(sql`${tripPlaces.id} = r."tripPlaceId"`, eq(tripPlaces.tripId, turn.tripId), turnHolds(turn)))
    .returning({ id: tripPlaces.id });
  return rows.length;
}

/**
 * Finishes an ask: status, elapsed time, loosened filters, and the final
 * result count (counted from ask_places when not given). Conditional on the
 * lock and on the ask belonging to this trip.
 * @returns false when nothing was written.
 */
export async function finishAsk(
  turn: TurnRef,
  askId: string,
  patch: { status: "done" | "failed"; elapsedMs: number; loosened: string[]; resultCount?: number },
): Promise<boolean> {
  const count =
    patch.resultCount ?? sql<number>`(select count(*)::int from ask_places ap where ap.ask_id = ${askId}::uuid)`;
  const rows = await db
    .update(tripAsks)
    .set({
      status: patch.status,
      elapsedMs: Math.round(patch.elapsedMs),
      loosened: patch.loosened,
      resultCount: count,
      updatedAt: sql`now()`,
    })
    .where(and(eq(tripAsks.id, askId), eq(tripAsks.tripId, turn.tripId), turnHolds(turn)))
    .returning({ id: tripAsks.id });
  return rows.length > 0;
}

/**
 * The seed's trip columns: `seed_status` (running at start, done at the end,
 * failed in the catch) and `built_from`. Conditional on the lock.
 * @returns false when nothing was written.
 */
export async function writeSeedState(
  turn: TurnRef,
  patch: { seedStatus?: TripSnapshot["trip"]["seedStatus"]; builtFrom?: BuiltFrom },
): Promise<boolean> {
  if (patch.seedStatus === undefined && patch.builtFrom === undefined) return false;
  const rows = await db
    .update(trips)
    .set({
      ...(patch.seedStatus ? { seedStatus: patch.seedStatus } : {}),
      ...(patch.builtFrom ? { builtFrom: patch.builtFrom } : {}),
      updatedAt: sql`now()`,
    })
    .where(and(eq(trips.id, turn.tripId), turnHolds(turn)))
    .returning({ id: trips.id });
  return rows.length > 0;
}

/**
 * The seed's cleanup (its catch and its finally, which also runs when Stop
 * ends the generator at a yield). A stopped seed must not stay "running", so
 * this lands while the turn still has the lock (stop requested or not) or
 * while no turn has it, and only over a running seed: it never touches a
 * seed a newer turn is running or has finished. The turn's release does the
 * same as a backstop (chat-store.ts releaseTurn).
 */
export async function markSeedFailed(turn: TurnRef): Promise<boolean> {
  const ownsOrFree = sql`exists (
    select 1 from ${chats}
    where ${chats.id} = ${turn.chatId}
      and (${chats.activeTurnId} = ${turn.turnId} or ${chats.activeTurnId} is null)
  )`;
  const rows = await db
    .update(trips)
    .set({ seedStatus: "failed", updatedAt: sql`now()` })
    .where(and(eq(trips.id, turn.tripId), eq(trips.seedStatus, "running"), ownsOrFree))
    .returning({ id: trips.id });
  return rows.length > 0;
}
