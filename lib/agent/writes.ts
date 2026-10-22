import "server-only";

import { and, eq, sql, type SQL } from "drizzle-orm";
import { FatalError } from "workflow";

import type { BuiltFrom, TripSnapshot } from "@/lib/contracts";
import { db } from "@/lib/db";
import { chats, tripAsks, tripPlaces, trips } from "@/lib/db/schema";

// Every write an agent tool makes goes through here. Two rules (PLAN 6.1):
//
// 1. A write only lands while the turn that made it still holds the chat's
//    lock (chats.active_turn_id = turnId). A stopped or superseded run can
//    never touch the board of a newer turn.
// 2. A write is idempotent by key: asks by toolCallId, trip places by
//    (trip, place), ask places by (ask, trip place), reasons by trip place.
//    Workflow retries a failed step from the top, so a replay rewrites the
//    same rows instead of adding new ones.
//
// The writes owned here (reasons, ask status, seed state) carry the lock
// check inside the statement itself (`turnHolds`). Writes that go through the
// lib/trips and lib/places slices (upserts of places, trip places, asks, ask
// places, slots, call logs) are wrapped in `guarded`, which checks the lock
// right before the slice call; those slice writes are keyed upserts, so the
// worst a turn stopped in between can do is rewrite the same row.

/** The turn a tool step runs for. Serializable: it crosses the step boundary. */
export type TurnRef = { chatId: string; tripId: string; turnId: string };

/** The lock moved on: the turn was stopped or a newer turn started. Never retried. */
export class TurnSupersededError extends FatalError {
  constructor() {
    super("This reply was stopped or replaced by a newer one, so its changes were not saved.");
    this.name = "TurnSupersededError";
  }
}

/** `exists (chat of this trip whose lock is this turn)`, for a WHERE clause. */
export function turnHolds(turn: TurnRef): SQL {
  return sql`exists (
    select 1 from ${chats}
    where ${chats.id} = ${turn.chatId}
      and ${chats.tripId} = ${turn.tripId}
      and ${chats.activeTurnId} = ${turn.turnId}
  )`;
}

/** True while the turn holds its chat's lock. */
export async function holdsTurn(turn: TurnRef): Promise<boolean> {
  const rows = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, turn.chatId), eq(chats.tripId, turn.tripId), eq(chats.activeTurnId, turn.turnId)))
    .limit(1);
  return rows.length > 0;
}

/** @throws TurnSupersededError when the turn no longer holds the lock. */
export async function assertTurn(turn: TurnRef): Promise<void> {
  if (!(await holdsTurn(turn))) throw new TurnSupersededError();
}

/**
 * Runs a slice write (lib/trips, lib/places) only while the turn holds the
 * lock. The write itself must be a keyed upsert.
 */
export async function guarded<T>(turn: TurnRef, write: () => Promise<T>): Promise<T> {
  await assertTurn(turn);
  return write();
}

/**
 * Stores grounded reason sentences on trip places of this trip. One
 * statement, conditional on the lock. Keyed by trip place: a replay writes
 * the same text again. A null reason clears nothing (only strings are sent).
 * @returns how many trip places were updated (0 when the turn lost its lock).
 */
export async function writeReasons(turn: TurnRef, reasons: { tripPlaceId: string; reason: string }[]): Promise<number> {
  if (reasons.length === 0) return 0;
  const rows = await db
    .update(tripPlaces)
    .set({
      reason: sql`r.reason`,
      updatedAt: sql`now()`,
    })
    .from(sql`jsonb_to_recordset(${JSON.stringify(reasons)}::jsonb) as r("tripPlaceId" uuid, reason text)`)
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
 * The seed's catch path. A seed that was stopped (lock already released)
 * must not stay "running" forever, so this lands while the turn holds the
 * lock or while no turn holds it, and only over a running seed: it never
 * touches a seed a newer turn is running or has finished.
 */
export async function markSeedFailed(turn: TurnRef): Promise<boolean> {
  const noTurn = sql`exists (
    select 1 from ${chats} where ${chats.id} = ${turn.chatId} and ${chats.activeTurnId} is null
  )`;
  const rows = await db
    .update(trips)
    .set({ seedStatus: "failed", updatedAt: sql`now()` })
    .where(and(eq(trips.id, turn.tripId), eq(trips.seedStatus, "running"), sql`(${turnHolds(turn)} or ${noTurn})`))
    .returning({ id: trips.id });
  return rows.length > 0;
}
