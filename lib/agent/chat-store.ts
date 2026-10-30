import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { inScopeAs, isUuid, toScope, type ScopeInput } from "@/lib/auth/scope";
import type { AppUIMessage, ChatSnapshot } from "@/lib/contracts";
import { db } from "@/lib/db";
import { chats, chatTurns } from "@/lib/db/schema";

import { chatTitleFrom } from "./chat-title";

// Every write to a chats row and its chat_turns records, in one file. The
// rules (PLAN 6.1, 6.5):
//
// - The turn lock is `active_turn_id`, taken with one conditional UPDATE that
//   also appends the user message and inserts the chat_turns record, so a
//   chat is never locked without the message and the record that locked it.
// - Every write a turn makes (persist, idle, failed) is conditional on
//   `active_turn_id = turnId`, so a cancelled or superseded run can never
//   overwrite a newer turn. A write that matches no row returns false.
// - Releasing the lock finalizes the turn record in the same statement.
// - Message writes are idempotent by message id, so a Workflow step replay
//   never duplicates a message.
// - A trip has several chats. A chat is read and written by its own id; the
//   trip-level reads below (list, default, create) check the trip's scope and
//   the chat's owner in the same statement.
//
// Plain SQL thinking through Drizzle; jsonb surgery happens in Postgres so a
// write is one round trip with no read-modify-write race. Statements that
// touch both tables are data-modifying CTEs: one statement, one snapshot.

export type ChatRow = typeof chats.$inferSelect;
export type ChatTurnRow = typeof chatTurns.$inferSelect;
export type ChatStatus = ChatSnapshot["chat"]["status"];
export type TurnStatus = "running" | "completed" | "stopped" | "failed";

/** A lock with no run id older than this is a crash between lock and start(). */
export const ORPHAN_LOCK_MS = 60_000;

export async function getChat(chatId: string): Promise<ChatRow | undefined> {
  const rows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  return rows[0];
}

export async function getTurn(turnId: string): Promise<ChatTurnRow | undefined> {
  const rows = await db.select().from(chatTurns).where(eq(chatTurns.turnId, turnId)).limit(1);
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
      ...(row.title ? { title: row.title } : {}),
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

/** One row of a trip's chat list: no transcript. */
export type TripChatItem = { id: string; tripId: string; title: string | null; updatedAt: Date };

const tripChatItem = { id: chats.id, tripId: chats.tripId, title: chats.title, updatedAt: chats.updatedAt };

// Drizzle prints a single-table select's columns unqualified; name the outer row.
const CHAT_TRIP_ID = sql.raw(`"chats"."trip_id"`);

/** `chats.trip_id` names a trip in scope (owner or org). */
function tripInScopeSql(scope: ScopeInput) {
  return sql`exists (select 1 from trips t where t.id = ${CHAT_TRIP_ID} and ${inScopeAs("t", scope)})`;
}

/**
 * The caller's chats of several trips, newest first (by last activity).
 * One query for the nav drawer; group by `tripId` on the caller's side.
 */
export async function listChatsForTrips(tripIds: readonly string[], scope: ScopeInput): Promise<TripChatItem[]> {
  const ids = tripIds.filter(isUuid);
  if (ids.length === 0) return [];
  return db
    .select(tripChatItem)
    .from(chats)
    .where(and(inArray(chats.tripId, ids), eq(chats.ownerId, toScope(scope).ownerId), tripInScopeSql(scope)))
    .orderBy(desc(chats.updatedAt), desc(chats.createdAt));
}

/** A trip's chats, newest first. Empty for a trip out of scope. */
export function listTripChats(tripId: string, scope: ScopeInput): Promise<TripChatItem[]> {
  return listChatsForTrips([tripId], scope);
}

/**
 * The chat a trip page opens: `chatId` when it is one of the trip's chats
 * the caller owns, else (no `chatId`) the trip's most recently active chat.
 * Undefined when `chatId` is not the trip's, or the trip has no chat.
 */
export async function getTripChat(tripId: string, chatId: string | undefined, scope: ScopeInput): Promise<ChatRow | undefined> {
  if (!isUuid(tripId) || (chatId !== undefined && !isUuid(chatId))) return undefined;
  const rows = await db
    .select()
    .from(chats)
    .where(
      and(
        eq(chats.tripId, tripId),
        chatId ? eq(chats.id, chatId) : undefined,
        eq(chats.ownerId, toScope(scope).ownerId),
        tripInScopeSql(scope),
      ),
    )
    .orderBy(desc(chats.updatedAt), desc(chats.createdAt))
    .limit(1);
  return rows[0];
}

/**
 * A new chat for a trip in scope, owned by the caller. When the trip already
 * has an empty chat of the caller's (no message, no title, no turn), that
 * one is brought to the top and returned instead, so "New chat" never piles
 * up blank chats. Undefined when the trip is not in scope.
 */
export async function createTripChat(tripId: string, scope: ScopeInput): Promise<TripChatItem | undefined> {
  if (!isUuid(tripId)) return undefined;
  const ownerId = toScope(scope).ownerId;
  const result = (await db.execute(sql`
    with trip as (
      select t.id from trips t where t.id = ${tripId} and ${inScopeAs("t", scope)}
    ),
    blank as (
      select c.id from chats c
      where c.trip_id = (select id from trip) and c.owner_id = ${ownerId}
        and c.title is null and c.active_turn_id is null and c.messages = '[]'::jsonb
      order by c.updated_at desc
      limit 1
    ),
    reused as (
      update chats set updated_at = now()
      where id = (select id from blank)
      returning id, trip_id, title, updated_at
    ),
    inserted as (
      insert into chats (trip_id, owner_id)
      select id, ${ownerId} from trip where not exists (select 1 from blank)
      returning id, trip_id, title, updated_at
    )
    select * from reused union all select * from inserted
  `)) as unknown as Rows<{ id: string; trip_id: string; title: string | null; updated_at: string | Date }>;
  const row = result.rows[0];
  if (!row) return undefined;
  return { id: row.id, tripId: row.trip_id, title: row.title, updatedAt: new Date(row.updated_at) };
}

type Rows<T> = { rows: T[] };

/**
 * True when `messageId` may be (re)sent: it is not in the transcript yet, or
 * it is the last user message (the Retry of a failed turn). Evaluated inside
 * the lock statement, so the check and the write see the same transcript.
 */
function resendableSql(messageId: string) {
  return sql`(
    not exists (select 1 from jsonb_array_elements(chats.messages) e(m) where m->>'id' = ${messageId})
    or exists (
      select 1 from jsonb_array_elements(chats.messages) with ordinality k(km, kord)
      where km->>'id' = ${messageId} and km->>'role' = 'user'
        and not exists (
          select 1 from jsonb_array_elements(chats.messages) with ordinality a(am, aord)
          where aord > kord and am->>'role' = 'user'
        )
    )
  )`;
}

/**
 * Takes the turn lock, appends the user message and records the turn, in one
 * statement. When the message id is already in the transcript (the Retry of
 * a failed turn re-sends the same user message under a new turn id) the
 * transcript is cut back to that message instead, and the message is
 * replaced by the new copy: the failed partial reply goes, the message is
 * never duplicated. A chat without a title takes one from the message
 * (chatTitleFrom) in the same statement. The statement only matches when:
 *   - no turn holds the lock,
 *   - this turnId was never recorded (a finished turn is not run again),
 *   - the message is new or is the last user message (no answered history is cut).
 *
 * @returns true when this call took the lock.
 */
export async function takeTurnLock(chatId: string, turnId: string, message: AppUIMessage): Promise<boolean> {
  const json = JSON.stringify(message);
  const title = chatTitleFrom(message);
  const result = (await db.execute(sql`
    with locked as (
      update chats set
        status = 'running',
        title = coalesce(chats.title, ${title}::text),
        active_turn_id = ${turnId},
        active_run_id = null,
        stop_requested_at = null,
        last_error = null,
        messages = case
          when exists (select 1 from jsonb_array_elements(chats.messages) e(m) where m->>'id' = ${message.id})
          then (
            select jsonb_agg(case when m->>'id' = ${message.id} then ${json}::jsonb else m end order by ord)
            from jsonb_array_elements(chats.messages) with ordinality as t(m, ord)
            where ord <= (
              select kord from jsonb_array_elements(chats.messages) with ordinality as k(km, kord)
              where km->>'id' = ${message.id} limit 1
            )
          )
          else chats.messages || jsonb_build_array(${json}::jsonb)
        end,
        updated_at = now()
      where chats.id = ${chatId}
        and chats.active_turn_id is null
        and not exists (select 1 from chat_turns where chat_turns.turn_id = ${turnId})
        and ${resendableSql(message.id)}
      returning chats.id
    )
    insert into chat_turns (chat_id, turn_id, status)
    select id, ${turnId}, 'running' from locked
    returning turn_id
  `)) as unknown as Rows<{ turn_id: string }>;
  return result.rows.length > 0;
}

/** Records the Workflow run id for the turn that holds the lock, on the chat and the turn record. */
export async function setActiveRun(chatId: string, turnId: string, runId: string): Promise<boolean> {
  const result = (await db.execute(sql`
    with chat as (
      update chats set active_run_id = ${runId}, updated_at = now()
      where id = ${chatId} and active_turn_id = ${turnId}
      returning id
    )
    update chat_turns set run_id = ${runId}
    where turn_id = ${turnId} and exists (select 1 from chat)
    returning turn_id
  `)) as unknown as Rows<{ turn_id: string }>;
  return result.rows.length > 0;
}

/** The jsonb expression that upserts `message` into chats.messages (replace in place, else append). */
function upsertMessageSql(message: AppUIMessage) {
  const json = JSON.stringify(message);
  return sql`case
    when exists (select 1 from jsonb_array_elements(${chats.messages}) m where m->>'id' = ${message.id})
    then (
      select jsonb_agg(case when m->>'id' = ${message.id} then ${json}::jsonb else m end order by ord)
      from jsonb_array_elements(${chats.messages}) with ordinality as t(m, ord)
    )
    else ${chats.messages} || jsonb_build_array(${json}::jsonb)
  end`;
}

/**
 * Upserts one message by id (replace in place, else append), only while
 * `turnId` holds the lock. Idempotent for step replays.
 */
export async function saveTurnMessage(chatId: string, turnId: string, message: AppUIMessage): Promise<boolean> {
  const rows = await db
    .update(chats)
    .set({ messages: upsertMessageSql(message), updatedAt: sql`now()` })
    .where(and(eq(chats.id, chatId), eq(chats.activeTurnId, turnId)))
    .returning({ id: chats.id });
  return rows.length > 0;
}

/**
 * Records that `turnId`'s assistant message could not be saved and still
 * lives in `runId`'s stream. Only while that turn holds the lock, so the
 * record always exists before the lock is released.
 */
export async function markPendingSave(chatId: string, turnId: string, runId: string): Promise<boolean> {
  const rows = await db
    .update(chats)
    .set({ pendingRunId: runId, pendingTurnId: turnId, pendingSince: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(chats.id, chatId), eq(chats.activeTurnId, turnId)))
    .returning({ id: chats.id });
  return rows.length > 0;
}

/**
 * Saves a pending assistant message and clears the pending record, only
 * while the record still points at `runId`. The message goes right after
 * the user message of its turn (a later turn may have started meanwhile).
 */
export async function savePendingMessage(chatId: string, runId: string, message: AppUIMessage): Promise<boolean> {
  const json = JSON.stringify(message);
  const turnId = message.metadata?.turnId ?? "";
  const rows = await db
    .update(chats)
    .set({
      messages: sql`case
        when exists (select 1 from jsonb_array_elements(${chats.messages}) m where m->>'id' = ${message.id})
        then (
          select jsonb_agg(case when m->>'id' = ${message.id} then ${json}::jsonb else m end order by ord)
          from jsonb_array_elements(${chats.messages}) with ordinality as t(m, ord)
        )
        else (
          select coalesce(jsonb_agg(x order by o1, o2), '[]'::jsonb) from (
            select m as x, ord::numeric as o1, 0 as o2
            from jsonb_array_elements(${chats.messages}) with ordinality as t(m, ord)
            union all
            select ${json}::jsonb, coalesce((
              select max(kord) from jsonb_array_elements(${chats.messages}) with ordinality as k(km, kord)
              where km->>'role' = 'user' and km->'metadata'->>'turnId' = ${turnId}
            ), 1e12)::numeric, 1
          ) s
        )
      end`,
      pendingRunId: null,
      pendingTurnId: null,
      pendingSince: null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(chats.id, chatId), eq(chats.pendingRunId, runId)))
    .returning({ id: chats.id });
  return rows.length > 0;
}

/** Drops a pending record (saved meanwhile, nothing to save, or past the stream's retention). */
export async function clearPendingSave(chatId: string, runId: string): Promise<boolean> {
  const rows = await db
    .update(chats)
    .set({ pendingRunId: null, pendingTurnId: null, pendingSince: null, updatedAt: sql`now()` })
    .where(and(eq(chats.id, chatId), eq(chats.pendingRunId, runId)))
    .returning({ id: chats.id });
  return rows.length > 0;
}

export type ReleaseOptions = {
  status: Exclude<ChatStatus, "running">;
  lastError?: string;
  /**
   * The turn record's final status. "auto" (the default for an idle
   * release): stopped when a stop was requested, else completed. A failed
   * chat status always records failed.
   */
  outcome?: Exclude<TurnStatus, "running"> | "auto";
  /** Writes a pending save record for this run in the same statement (the reply could not be saved). */
  pendingRunId?: string;
};

/**
 * What a turn leaves behind on the board, finished with the turn (PLAN 6.5):
 * every ask the turn started that is still running (its tool was stopped,
 * failed or interrupted) becomes done with the places it found, or failed
 * when it found none; a seed still "running" becomes failed. CTE parts for
 * the release statement; `released` must return the chat's `trip_id`.
 */
function finalizeTurnRecordsSql(turnId: string) {
  return sql`
    asks_finished as (
      update trip_asks set
        status = case when exists (select 1 from ask_places ap where ap.ask_id = trip_asks.id) then 'done' else 'failed' end,
        result_count = (select count(*)::int from ask_places ap where ap.ask_id = trip_asks.id),
        elapsed_ms = coalesce(trip_asks.elapsed_ms, (extract(epoch from now() - trip_asks.created_at) * 1000)::int),
        updated_at = now()
      where trip_asks.turn_id = ${turnId} and trip_asks.status = 'running'
        and exists (select 1 from released)
      returning trip_asks.id
    ),
    seed_finished as (
      update trips set seed_status = 'failed', updated_at = now()
      where trips.id = (select trip_id from released) and trips.seed_status = 'running'
      returning trips.id
    )`;
}

/**
 * Finishes the turn's running asks and a running seed without touching the
 * lock: the failure path that keeps the lock for the heal path. Lands while
 * the turn still has the lock (stop requested or not) or no turn has it, so
 * it never finishes a seed a newer turn runs. The release does the same.
 */
export async function finalizeTurnRecords(chatId: string, turnId: string): Promise<void> {
  await db.execute(sql`
    with released as (
      select id, trip_id from chats
      where id = ${chatId} and (active_turn_id = ${turnId} or active_turn_id is null)
    ),
    ${finalizeTurnRecordsSql(turnId)}
    select 1
  `);
}

/**
 * Releases the lock held by `turnId` and finalizes its turn record, its
 * running asks and a running seed (finalizeTurnRecordsSql), in one
 * statement. A newer turn's lock is never touched.
 */
export async function releaseTurn(
  chatId: string,
  turnId: string,
  { status, lastError, outcome = "auto", pendingRunId }: ReleaseOptions,
): Promise<boolean> {
  const error = lastError ?? null;
  const turnStatus =
    status === "failed"
      ? sql`'failed'`
      : outcome === "auto"
        ? sql`case when (select stop_requested_at from prev) is not null then 'stopped' else 'completed' end`
        : sql`${outcome}`;
  const pending = pendingRunId
    ? sql`pending_run_id = ${pendingRunId}, pending_turn_id = ${turnId}, pending_since = now(),`
    : sql``;
  const result = (await db.execute(sql`
    with prev as (
      select stop_requested_at from chats where id = ${chatId} and active_turn_id = ${turnId}
    ),
    released as (
      update chats set
        status = ${status},
        last_error = ${error},
        active_turn_id = null,
        active_run_id = null,
        stop_requested_at = null,
        ${pending}
        updated_at = now()
      where id = ${chatId} and active_turn_id = ${turnId}
      returning id, trip_id
    ),
    ${finalizeTurnRecordsSql(turnId)},
    finalized as (
      update chat_turns set status = ${turnStatus}, error = ${error}, finished_at = now()
      where turn_id = ${turnId} and chat_id = ${chatId} and exists (select 1 from released)
      returning turn_id
    )
    select id from released
  `)) as unknown as Rows<{ id: string }>;
  return result.rows.length > 0;
}

/** Marks a turn record failed without touching the lock (start() threw; the release follows). */
export async function markTurnFailed(chatId: string, turnId: string, error: string): Promise<void> {
  await db
    .update(chatTurns)
    .set({ status: "failed", error, finishedAt: sql`now()` })
    .where(and(eq(chatTurns.turnId, turnId), eq(chatTurns.chatId, chatId), eq(chatTurns.status, "running")));
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
