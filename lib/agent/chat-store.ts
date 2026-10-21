import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { AppUIMessage, ChatSnapshot } from "@/lib/contracts";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";

// Every write to a chats row, in one file. The rules (PLAN 6.1, 6.5):
//
// - The turn lock is `active_turn_id`, taken with one conditional UPDATE.
// - Every write a turn makes (persist, idle, failed) is conditional on
//   `active_turn_id = turnId`, so a cancelled or superseded run can never
//   overwrite a newer turn. A write that matches no row returns false.
// - Message writes are idempotent by message id, so a Workflow step replay
//   never duplicates a message.
//
// Plain SQL thinking through Drizzle; jsonb surgery happens in Postgres so a
// write is one round trip with no read-modify-write race.

export type ChatRow = typeof chats.$inferSelect;
export type ChatStatus = ChatSnapshot["chat"]["status"];

/** A lock with no run id older than this is a crash between lock and start(). */
export const ORPHAN_LOCK_MS = 60_000;

export async function getChat(chatId: string): Promise<ChatRow | undefined> {
  const rows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  return rows[0];
}

export function toChatSnapshot(row: ChatRow): ChatSnapshot {
  return {
    chat: {
      id: row.id,
      tripId: row.tripId,
      status: row.status === "running" || row.status === "failed" ? row.status : "idle",
      activeRunId: row.activeRunId ?? undefined,
      activeTurnId: row.activeTurnId ?? undefined,
      lastError: row.lastError ?? undefined,
      messages: row.messages,
    },
  };
}

export async function createChatForTrip(tripId: string, ownerId: string): Promise<ChatRow> {
  const rows = await db.insert(chats).values({ tripId, ownerId }).returning();
  const row = rows[0];
  if (!row) throw new Error("Chat insert returned no row");
  return row;
}

/**
 * Takes the turn lock and appends the user message in the same statement, so
 * a chat is never locked without the message that locked it. The message is
 * not appended again when it already is the last message: the Retry of a
 * failed turn re-sends that same user message under a new turn id.
 *
 * @returns true when this call took the lock.
 */
export async function takeTurnLock(chatId: string, turnId: string, message: AppUIMessage): Promise<boolean> {
  const rows = await db
    .update(chats)
    .set({
      status: "running",
      activeTurnId: turnId,
      activeRunId: null,
      stopRequestedAt: null,
      lastError: null,
      messages: sql`case
        when ${chats.messages}->-1->>'id' = ${message.id} then ${chats.messages}
        else ${chats.messages} || jsonb_build_array(${JSON.stringify(message)}::jsonb)
      end`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(chats.id, chatId), sql`${chats.activeTurnId} is null`))
    .returning({ id: chats.id });
  return rows.length > 0;
}

/** Records the Workflow run id for the turn that holds the lock. */
export async function setActiveRun(chatId: string, turnId: string, runId: string): Promise<boolean> {
  const rows = await db
    .update(chats)
    .set({ activeRunId: runId, updatedAt: sql`now()` })
    .where(and(eq(chats.id, chatId), eq(chats.activeTurnId, turnId)))
    .returning({ id: chats.id });
  return rows.length > 0;
}

/**
 * Upserts one message by id (replace in place, else append), only while
 * `turnId` holds the lock. Idempotent for step replays.
 */
export async function saveTurnMessage(chatId: string, turnId: string, message: AppUIMessage): Promise<boolean> {
  const json = JSON.stringify(message);
  const rows = await db
    .update(chats)
    .set({
      messages: sql`case
        when exists (select 1 from jsonb_array_elements(${chats.messages}) m where m->>'id' = ${message.id})
        then (
          select jsonb_agg(case when m->>'id' = ${message.id} then ${json}::jsonb else m end order by ord)
          from jsonb_array_elements(${chats.messages}) with ordinality as t(m, ord)
        )
        else ${chats.messages} || jsonb_build_array(${json}::jsonb)
      end`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(chats.id, chatId), eq(chats.activeTurnId, turnId)))
    .returning({ id: chats.id });
  return rows.length > 0;
}

/** Releases the lock held by `turnId`. A newer turn's lock is never touched. */
export async function releaseTurn(
  chatId: string,
  turnId: string,
  { status, lastError }: { status: Exclude<ChatStatus, "running">; lastError?: string },
): Promise<boolean> {
  const rows = await db
    .update(chats)
    .set({
      status,
      lastError: lastError ?? null,
      activeTurnId: null,
      activeRunId: null,
      stopRequestedAt: null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(chats.id, chatId), eq(chats.activeTurnId, turnId)))
    .returning({ id: chats.id });
  return rows.length > 0;
}

/** Marks a stop request on the running turn. Returns the turn it applies to, if any. */
export async function requestStop(
  chatId: string,
): Promise<{ turnId: string; runId: string | null } | undefined> {
  const rows = await db
    .update(chats)
    .set({ stopRequestedAt: sql`coalesce(${chats.stopRequestedAt}, now())`, updatedAt: sql`now()` })
    .where(and(eq(chats.id, chatId), sql`${chats.activeTurnId} is not null`))
    .returning({ turnId: chats.activeTurnId, runId: chats.activeRunId });
  const row = rows[0];
  return row?.turnId ? { turnId: row.turnId, runId: row.runId } : undefined;
}

/** True when the lock was taken but start() never recorded a run (crash in between). */
export function isOrphanLock(row: ChatRow, now = Date.now()): boolean {
  return (
    row.activeTurnId !== null &&
    row.activeRunId === null &&
    now - row.updatedAt.getTime() > ORPHAN_LOCK_MS
  );
}
