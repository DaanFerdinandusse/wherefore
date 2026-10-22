import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, getTableColumns, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";

import { InvalidInputError, NotFoundError } from "@/lib/auth/errors";
import { inScope, isUuid, toScope, type ScopeInput } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import {
  advisorPlaces,
  askPlaces,
  chats,
  clients,
  itinerarySlots,
  tripAsks,
  tripCalls,
  tripPlaces,
  trips,
  tripTravelers,
} from "@/lib/db/schema";

import type {
  AddAskPlaces,
  ArchiveAsk,
  ClearSlot,
  CreateAsk,
  CreateTrip,
  LogTripCall,
  RevokeShare,
  SetShareToken,
  SetSlots,
  SetSlotsResult,
  SetStageOverride,
  SetTripPlaceStatus,
  SlotInput,
  SlotRejection,
  Trip,
  UpdateAsk,
  UpdateTrip,
  UpsertSlot,
  UpsertTripPlaces,
} from "./contracts";
import { defaultTripTitle, isSlotName, toAsk, toSlot } from "./map";
import { foldTripPlaces, SOURCE_PRIORITY } from "./merge";

// Writes for trips and everything hanging off a trip. Two invariants live here:
// trips.search is rebuilt by refreshTripSearch in the same batch as any write
// to its inputs, and trip_places.status follows the itinerary (syncPlaceStatuses).

// Trip helpers

/** trips.search = title + client name + destination name. */
export function refreshTripSearch(where: SQL) {
  return db
    .update(trips)
    .set({
      search: sql`concat_ws(' ', ${trips.title}, ${trips.clientName}, ${trips.destination} ->> 'name')`,
    })
    .where(where)
    .returning();
}

function ownedTrip(id: string, scope: ScopeInput): SQL {
  return and(eq(trips.id, id), inScope(trips, scope)) as SQL;
}

function ownedTripIds(scope: ScopeInput) {
  return db.select({ id: trips.id }).from(trips).where(inScope(trips, scope));
}

async function requireTripId(tripId: string, scope: ScopeInput): Promise<void> {
  if (!isUuid(tripId)) throw new NotFoundError("trip");
  const [row] = await db.select({ id: trips.id }).from(trips).where(ownedTrip(tripId, scope)).limit(1);
  if (!row) throw new NotFoundError("trip");
}

function single<T>(rows: T[], entity: string): T {
  const row = rows[0];
  if (!row) throw new NotFoundError(entity);
  return row;
}

// Trips

export const createTrip: CreateTrip = async (ownerId, input) => {
  const scope = toScope(ownerId);
  const travelerClientIds = [
    ...new Set([input.clientId, ...input.travelers.map((t) => t.clientId).filter((id): id is string => !!id)]),
  ];
  if (!travelerClientIds.every(isUuid)) throw new NotFoundError("client");

  const ownedClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(inArray(clients.id, travelerClientIds), inScope(clients, scope)));
  const client = ownedClients.find((c) => c.id === input.clientId);
  if (!client) throw new NotFoundError("client");
  if (ownedClients.length !== travelerClientIds.length) throw new NotFoundError("client");

  const travelers = input.travelers.some((t) => t.clientId === input.clientId)
    ? input.travelers
    : [{ clientId: input.clientId, name: client.name, role: "client" as const, drivesSearch: true }, ...input.travelers];

  const tripId = randomUUID();
  const chatId = randomUUID();
  const title = input.title?.trim() || defaultTripTitle(input.destination.name, client.name);

  const [, , travelerRows, refreshed] = await db.batch([
    db.insert(trips).values({
      id: tripId,
      ownerId: scope.ownerId,
      orgId: scope.orgId,
      clientId: client.id,
      title,
      destination: input.destination,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      datesMode: input.datesMode,
      adults: input.adults,
      children: input.children,
      chatId,
      // Read inside the insert, with a share lock on the client row: a rename
      // running at the same time either finishes first (we read the new
      // name) or waits for this batch and then rewrites this trip too.
      clientName: sql`(select ${clients.name} from ${clients} where ${clients.id} = ${client.id} for share)`,
    }),
    db.insert(chats).values({ id: chatId, tripId, ownerId: scope.ownerId }),
    db
      .insert(tripTravelers)
      .values(
        travelers.map((t, position) => ({
          tripId,
          clientId: t.clientId ?? null,
          name: t.name.trim(),
          role: t.role,
          drivesSearch: t.drivesSearch,
          position,
        })),
      )
      .returning(),
    refreshTripSearch(eq(trips.id, tripId)),
  ]);
  return { trip: single(refreshed, "trip"), chatId, travelers: travelerRows };
};

export const updateTrip: UpdateTrip = async (id, patch, scope) => {
  if (!isUuid(id)) throw new NotFoundError("trip");
  const where = ownedTrip(id, scope);
  const title = patch.title?.trim();
  const [, refreshed] = await db.batch([
    db
      .update(trips)
      .set({ ...patch, ...(title ? { title } : {}), updatedAt: sql`now()` })
      .where(where),
    refreshTripSearch(where),
  ]);
  return single(refreshed, "trip");
};

/** A 24 character url-safe token: 18 random bytes. */
export function newShareToken(): string {
  return randomBytes(18).toString("base64url");
}

async function setTripColumns(
  id: string,
  scope: ScopeInput,
  set: PgUpdateSetSource<typeof trips>,
): Promise<Trip> {
  if (!isUuid(id)) throw new NotFoundError("trip");
  const rows = await db
    .update(trips)
    .set({ ...set, updatedAt: sql`now()` })
    .where(ownedTrip(id, scope))
    .returning();
  return single(rows, "trip");
}

export const setShareToken: SetShareToken = (id, scope) =>
  setTripColumns(id, scope, {
    shareToken: sql`coalesce(${trips.shareToken}, ${newShareToken()})`,
    sharedAt: sql`coalesce(${trips.sharedAt}, now())`,
  });

export const revokeShare: RevokeShare = (id, scope) =>
  setTripColumns(id, scope, { shareToken: null, sharedAt: null });

export const setStageOverride: SetStageOverride = (id, stage, scope) =>
  setTripColumns(id, scope, { stageOverride: stage });

// Trip places

const PRIORITY = sql.raw(`array[${SOURCE_PRIORITY.map((s) => `'${s}'`).join(", ")}]::text[]`);
const ex = (column: string) => sql.raw(`excluded.${column}`);

/**
 * The advisor place link, checked in the insert itself: the id only sticks
 * when that saved place is in the caller's scope and saves this same place.
 * Anything else (another advisor's place, a mismatch, a deleted save) stores
 * null, so a card can never show someone else's private note.
 */
function ownAdvisorPlace(advisorPlaceId: string | null | undefined, placeId: string, scope: ScopeInput) {
  if (!advisorPlaceId || !isUuid(advisorPlaceId)) return null;
  return sql`(${db
    .select({ id: advisorPlaces.id })
    .from(advisorPlaces)
    .where(
      and(
        eq(advisorPlaces.id, advisorPlaceId),
        eq(advisorPlaces.placeId, placeId),
        inScope(advisorPlaces, scope),
      ),
    )})`;
}

export const upsertTripPlaces: UpsertTripPlaces = async (tripId, rows, scope) => {
  await requireTripId(tripId, scope);
  const folded = foldTripPlaces(rows.filter((row) => isUuid(row.placeId)));
  if (folded.length === 0) return {};

  // The incoming row has the better score: take its score set.
  const better = sql`(${ex("best_score")} is not null and (${tripPlaces.bestScore} is null or ${ex("best_score")} > ${tripPlaces.bestScore}))`;
  const pick = (column: string, current: SQL | typeof tripPlaces.bestScore) =>
    sql`case when ${better} then ${ex(column)} else ${current} end`;

  const returned = await db
    .insert(tripPlaces)
    .values(
      folded.map((row) => ({
        tripId,
        placeId: row.placeId,
        source: row.source,
        category: row.category,
        bestAffinity: row.bestAffinity ?? null,
        bestScore: row.bestScore ?? null,
        explainability: row.explainability ?? [],
        sharedTags: row.sharedTags ?? [],
        advisorPlaceId: ownAdvisorPlace(row.advisorPlaceId, row.placeId, scope),
        reason: row.reason ?? null,
        position: row.position ?? 0,
      })),
    )
    .onConflictDoUpdate({
      target: [tripPlaces.tripId, tripPlaces.placeId],
      set: {
        source: sql`case when array_position(${PRIORITY}, ${ex("source")}) > array_position(${PRIORITY}, ${tripPlaces.source}) then ${ex("source")} else ${tripPlaces.source} end`,
        category: sql`case when ${tripPlaces.category} = 'other' then ${ex("category")} else ${tripPlaces.category} end`,
        bestScore: pick("best_score", sql`${tripPlaces.bestScore}`),
        bestAffinity: pick("best_affinity", sql`${tripPlaces.bestAffinity}`),
        explainability: pick("explainability", sql`${tripPlaces.explainability}`),
        sharedTags: pick("shared_tags", sql`${tripPlaces.sharedTags}`),
        advisorPlaceId: sql`coalesce(${ex("advisor_place_id")}, ${tripPlaces.advisorPlaceId})`,
        reason: sql`coalesce(${ex("reason")}, ${tripPlaces.reason})`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: tripPlaces.id, placeId: tripPlaces.placeId });
  return Object.fromEntries(returned.map((row) => [row.placeId, row.id]));
};

export const setTripPlaceStatus: SetTripPlaceStatus = async (tripPlaceId, status, scope) => {
  if (!isUuid(tripPlaceId)) throw new NotFoundError("trip place");
  const where = and(eq(tripPlaces.id, tripPlaceId), inArray(tripPlaces.tripId, ownedTripIds(scope)));
  const update = db
    .update(tripPlaces)
    .set({ status, updatedAt: sql`now()` })
    .where(where)
    .returning();
  if (status !== "removed") return single(await update, "trip place");

  const [rows] = await db.batch([
    update,
    db
      .update(itinerarySlots)
      .set({ tripPlaceId: null, updatedAt: sql`now()` })
      .where(
        and(eq(itinerarySlots.tripPlaceId, tripPlaceId), inArray(itinerarySlots.tripId, ownedTripIds(scope))),
      ),
  ]);
  return single(rows, "trip place");
};

// Asks

// The ask's live result count. Qualified by hand: inside `returning` drizzle
// prints the target's columns bare, which the subquery would read as its own.
const ASK_PLACE_COUNT = sql<number>`(select count(*)::int from ask_places ap where ap.ask_id = "trip_asks"."id")`;
const askWithCount = { ...getTableColumns(tripAsks), liveCount: ASK_PLACE_COUNT };

function ownedAsk(askId: string, scope: ScopeInput): SQL {
  return and(eq(tripAsks.id, askId), inArray(tripAsks.tripId, ownedTripIds(scope))) as SQL;
}

export const createAsk: CreateAsk = async (tripId, input, scope) => {
  await requireTripId(tripId, scope);
  const rows = await db
    .insert(tripAsks)
    .values({
      tripId,
      label: input.label.trim(),
      query: input.query ?? {},
      toolCallId: input.toolCallId ?? null,
      chatMessageId: input.chatMessageId ?? null,
      status: input.status ?? "running",
    })
    .onConflictDoUpdate({
      target: tripAsks.toolCallId,
      // A retried tool call returns its ask; a clash with another trip's ask returns nothing.
      set: { updatedAt: sql`now()` },
      setWhere: eq(tripAsks.tripId, tripId),
    })
    .returning(askWithCount);
  const row = single(rows, "ask");
  return toAsk(row, row.liveCount);
};

/**
 * Patch an ask. `result_count` is the final count, written once: when the
 * ask moves to "done" without an explicit count, the number of its
 * ask_places rows is stored. The returned Ask carries the live count.
 */
export const updateAsk: UpdateAsk = async (askId, patch, scope) => {
  if (!isUuid(askId)) throw new NotFoundError("ask");
  const finalCount =
    patch.status === "done" && patch.resultCount === undefined ? { resultCount: ASK_PLACE_COUNT } : {};
  const rows = await db
    .update(tripAsks)
    .set({
      ...patch,
      ...finalCount,
      ...(patch.label ? { label: patch.label.trim() } : {}),
      updatedAt: sql`now()`,
    })
    .where(ownedAsk(askId, scope))
    .returning(askWithCount);
  const row = single(rows, "ask");
  return toAsk(row, row.liveCount);
};

export const archiveAsk: ArchiveAsk = (askId, scope) => updateAsk(askId, { status: "archived" }, scope);

export const addAskPlaces: AddAskPlaces = async (askId, rows, scope) => {
  if (!isUuid(askId)) throw new NotFoundError("ask");
  const [ask] = await db
    .select({ tripId: tripAsks.tripId })
    .from(tripAsks)
    .where(ownedAsk(askId, scope))
    .limit(1);
  if (!ask) throw new NotFoundError("ask");

  const requested = [...new Set(rows.map((r) => r.tripPlaceId))];
  const valid = new Set(
    requested.filter(isUuid).length === 0
      ? []
      : (
          await db
            .select({ id: tripPlaces.id })
            .from(tripPlaces)
            .where(and(eq(tripPlaces.tripId, ask.tripId), inArray(tripPlaces.id, requested.filter(isUuid))))
        ).map((r) => r.id),
  );
  const rejected = requested.filter((id) => !valid.has(id));

  // Last row wins for a trip place listed twice.
  const byTripPlace = new Map(rows.filter((r) => valid.has(r.tripPlaceId)).map((r) => [r.tripPlaceId, r]));
  const values = [...byTripPlace.values()].map((r) => ({
    askId,
    tripPlaceId: r.tripPlaceId,
    rank: r.rank,
    affinity: r.affinity ?? null,
    score: r.score ?? null,
    explainability: r.explainability ?? [],
  }));

  // No recount here: readers count ask_places themselves, so two writers
  // adding results at once can never leave a stale number behind.
  if (values.length === 0) return { added: 0, rejected };
  await db
    .insert(askPlaces)
    .values(values)
    .onConflictDoUpdate({
      target: [askPlaces.askId, askPlaces.tripPlaceId],
      set: {
        rank: sql`excluded.rank`,
        affinity: sql`excluded.affinity`,
        score: sql`excluded.score`,
        explainability: sql`excluded.explainability`,
      },
    });
  return { added: values.length, rejected };
};

// Itinerary slots
//
// neon-http has no interactive transactions: a db.batch is one transaction,
// but JS cannot read a row, decide, and write while holding a lock. So a slot
// write never trusts an earlier read. The insert itself keeps only the rows
// whose trip place is on this trip and not removed, and takes a share lock on
// those trip place rows until the batch commits. A removal running at the
// same time then either commits first (the row is skipped) or waits for this
// batch and clears the slot afterwards (setTripPlaceStatus clears slots in a
// later statement of its own batch). The status sync runs last in the same
// batch. See lib/db/README.md for what this does not cover.

type SlotMode = "replace" | "merge" | "single";

/** One input slot as the insert source reads it from jsonb. */
type SlotRow = {
  ord: number;
  day: number;
  date: string | null;
  slot: string;
  trip_place_id: string | null;
  note: string;
  note_for_traveler: boolean;
  position: number;
};

const slotKey = (s: { day: number; slot: string; position?: number | null }) =>
  `${s.day}|${s.slot}|${s.position ?? 0}`;

function assertSlotShapes(slots: SlotInput[]): void {
  for (const s of slots) {
    if (!Number.isInteger(s.day) || s.day < 1) throw new InvalidInputError(`Day ${s.day} is not a trip day.`);
    if (!isSlotName(s.slot)) throw new InvalidInputError(`"${s.slot}" is not a slot.`);
  }
}

function toSlotRow(s: SlotInput, ord: number): SlotRow {
  return {
    ord,
    day: s.day,
    date: s.date ?? null,
    slot: s.slot,
    trip_place_id: s.tripPlaceId ?? null,
    note: s.note?.trim() ?? "",
    note_for_traveler: s.noteForTraveler ?? false,
    position: s.position ?? 0,
  };
}

/**
 * The insert source: input rows whose trip place is on this trip and not
 * removed (or that name no place), one per (day, slot, position), the last
 * one winning. Columns follow the itinerary_slots column order.
 */
function slotSource(tripId: string, rows: SlotRow[]): SQL {
  return sql`
    select gen_random_uuid(), ${tripId}::uuid, v.day, v.date, v.slot, v.trip_place_id,
      v.note, v.note_for_traveler, v.position, now(), now()
    from (
      select distinct on (r.day, r.slot, r.position) r.*
      from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
        ord int, day int, date date, slot text, trip_place_id uuid,
        note text, note_for_traveler boolean, position int
      )
      where r.trip_place_id is null or exists (
        select 1 from trip_places tp
        where tp.id = r.trip_place_id and tp.trip_id = ${tripId}::uuid and tp.status <> 'removed'
        for share
      )
      order by r.day, r.slot, r.position, r.ord desc
    ) v`;
}

/**
 * How a repeat of (day, slot, position) treats the stored note. `merge` keeps
 * the stored note when the new one is empty; `single` keeps it when no note
 * was given. The traveler flag belongs to the note and moves with it.
 */
function noteSet(mode: SlotMode, noteGiven: boolean): Record<string, SQL> {
  if (mode === "merge") {
    return {
      note: sql`case when excluded.note = '' then ${itinerarySlots.note} else excluded.note end`,
      noteForTraveler: sql`case when excluded.note = '' then ${itinerarySlots.noteForTraveler} else excluded.note_for_traveler end`,
    };
  }
  if (mode === "single" && noteGiven) {
    return { note: sql`excluded.note`, noteForTraveler: sql`excluded.note_for_traveler` };
  }
  return {};
}

const slotTarget = [itinerarySlots.tripId, itinerarySlots.day, itinerarySlots.slot, itinerarySlots.position];

/** In a slot means "added", otherwise "suggested". Removed places stay removed. */
function syncPlaceStatuses(tripId: string | SQL, exceptSlotId?: string) {
  const otherSlot = exceptSlotId ? sql` and s.id <> ${exceptSlotId}::uuid` : sql``;
  const inItinerary = sql`exists (select 1 from itinerary_slots s where s.trip_place_id = ${tripPlaces.id}${otherSlot})`;
  const wanted = sql`case when ${inItinerary} then 'added' else 'suggested' end`;
  const trip = typeof tripId === "string" ? eq(tripPlaces.tripId, tripId) : sql`${tripPlaces.tripId} = ${tripId}`;
  return db
    .update(tripPlaces)
    .set({ status: wanted, updatedAt: sql`now()` })
    .where(and(trip, ne(tripPlaces.status, "removed"), sql`${tripPlaces.status} <> ${wanted}`));
}

/** Why each input slot with a trip place did not land, in input order. */
export function slotRejections(
  slots: SlotInput[],
  known: Map<string, string>,
  applied: { day: number; slot: string; position: number; tripPlaceId: string | null }[],
): SlotRejection[] {
  const landed = new Set(applied.map(slotKey));
  const rejected: SlotRejection[] = [];
  for (const s of slots) {
    const id = s.tripPlaceId;
    if (!id) continue;
    const status = known.get(id);
    if (!status) rejected.push({ tripPlaceId: id, reason: "This place is not on this trip." });
    else if (status === "removed" || !landed.has(slotKey(s))) {
      // Not landed although it looked fine: it was removed while we wrote.
      rejected.push({ tripPlaceId: id, reason: "This place was removed from the trip." });
    }
  }
  return rejected;
}

async function writeSlots(
  tripId: string,
  slots: SlotInput[],
  mode: SlotMode,
  noteGiven = true,
): Promise<SetSlotsResult> {
  assertSlotShapes(slots);
  // Ids that are not uuids cannot be on the trip; they never reach the uuid cast.
  const rows = slots
    .map(toSlotRow)
    .filter((row) => row.trip_place_id === null || isUuid(row.trip_place_id));
  const ids = [...new Set(rows.map((row) => row.trip_place_id).filter((id): id is string => !!id))];

  const check = db
    .select({ id: tripPlaces.id, status: tripPlaces.status })
    .from(tripPlaces)
    .where(and(eq(tripPlaces.tripId, tripId), inArray(tripPlaces.id, ids)));
  const clear = db.delete(itinerarySlots).where(eq(itinerarySlots.tripId, tripId));
  const insert = db.insert(itinerarySlots).select(slotSource(tripId, rows));

  let known: { id: string; status: string }[] = [];
  let applied: (typeof itinerarySlots.$inferSelect)[] = [];
  if (rows.length === 0) {
    if (mode === "replace") await db.batch([clear, syncPlaceStatuses(tripId)]);
  } else if (mode === "replace") {
    [known, , applied] = await db.batch([check, clear, insert.returning(), syncPlaceStatuses(tripId)]);
  } else {
    [known, applied] = await db.batch([
      check,
      insert
        .onConflictDoUpdate({
          target: slotTarget,
          set: {
            tripPlaceId: sql`excluded.trip_place_id`,
            date: sql`coalesce(excluded.date, ${itinerarySlots.date})`,
            ...noteSet(mode, noteGiven),
            updatedAt: sql`now()`,
          },
        })
        .returning(),
      syncPlaceStatuses(tripId),
    ]);
  }

  const statuses = new Map(known.map((row) => [row.id, row.status]));
  return { applied: applied.map(toSlot), rejected: slotRejections(slots, statuses, applied) };
}

export const setSlots: SetSlots = async (tripId, slots, mode, scope) => {
  await requireTripId(tripId, scope);
  return writeSlots(tripId, slots, mode);
};

export const upsertSlot: UpsertSlot = async (tripId, slot, scope) => {
  await requireTripId(tripId, scope);
  const { applied, rejected } = await writeSlots(tripId, [slot], "single", slot.note !== undefined);
  const value = applied[0];
  if (!value) throw new InvalidInputError(rejected[0]?.reason ?? "That slot cannot be saved.");
  return value;
};

/**
 * Empties one slot. The status sync and the delete share a batch: the sync
 * runs first and ignores the slot being deleted, so both see the same rows.
 */
export const clearSlot: ClearSlot = async (slotId, scope) => {
  if (!isUuid(slotId)) throw new NotFoundError("slot");
  const owned = and(eq(itinerarySlots.id, slotId), inArray(itinerarySlots.tripId, ownedTripIds(scope)));
  const tripOfSlot = db.select({ tripId: itinerarySlots.tripId }).from(itinerarySlots).where(owned);
  const [, deleted] = await db.batch([
    syncPlaceStatuses(sql`(${tripOfSlot})`, slotId),
    db.delete(itinerarySlots).where(owned).returning({ id: itinerarySlots.id }),
  ]);
  if (deleted.length === 0) throw new NotFoundError("slot");
};

// Call log

export const logTripCall: LogTripCall = async (tripId, call, scope) => {
  await requireTripId(tripId, scope);
  const rows = await db
    .insert(tripCalls)
    .values({
      tripId,
      endpoint: call.endpoint,
      params: call.params ?? {},
      count: call.count ?? 0,
      ms: Math.round(call.ms ?? 0),
      loosened: call.loosened ?? [],
      source: call.source ?? "manual",
    })
    .returning();
  return single(rows, "trip");
};

