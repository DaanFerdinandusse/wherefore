import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";

import { InvalidInputError, NotFoundError } from "@/lib/auth/errors";
import { inScope, isUuid, toScope, type ScopeInput } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import {
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
      clientName: client.name,
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
        bestAffinity: row.bestAffinity == null ? null : String(row.bestAffinity),
        bestScore: row.bestScore ?? null,
        explainability: row.explainability ?? [],
        sharedTags: row.sharedTags ?? [],
        advisorPlaceId: row.advisorPlaceId ?? null,
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

/** In a slot means "added", otherwise "suggested". Removed places stay removed. */
function syncPlaceStatuses(tripId: string) {
  const inItinerary = sql`exists (select 1 from itinerary_slots s where s.trip_place_id = ${tripPlaces.id})`;
  const wanted = sql`case when ${inItinerary} then 'added' else 'suggested' end`;
  return db
    .update(tripPlaces)
    .set({ status: wanted, updatedAt: sql`now()` })
    .where(and(eq(tripPlaces.tripId, tripId), ne(tripPlaces.status, "removed"), sql`${tripPlaces.status} <> ${wanted}`));
}

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
    .returning();
  return toAsk(single(rows, "ask"));
};

export const updateAsk: UpdateAsk = async (askId, patch, scope) => {
  if (!isUuid(askId)) throw new NotFoundError("ask");
  const rows = await db
    .update(tripAsks)
    .set({ ...patch, ...(patch.label ? { label: patch.label.trim() } : {}), updatedAt: sql`now()` })
    .where(ownedAsk(askId, scope))
    .returning();
  return toAsk(single(rows, "ask"));
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
    affinity: r.affinity == null ? null : String(r.affinity),
    score: r.score ?? null,
    explainability: r.explainability ?? [],
  }));

  const recount = db
    .update(tripAsks)
    .set({
      resultCount: sql`(select count(*)::int from ask_places ap where ap.ask_id = ${askId})`,
      updatedAt: sql`now()`,
    })
    .where(eq(tripAsks.id, askId));

  if (values.length === 0) {
    await recount;
    return { added: 0, rejected };
  }
  await db.batch([
    db
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
      }),
    recount,
  ]);
  return { added: values.length, rejected };
};

// Itinerary slots

const slotKey = (s: { day: number; slot: string; position?: number }) => `${s.day}|${s.slot}|${s.position ?? 0}`;

/** Splits slots into ones safe to write and rejections, deduped by (day, slot, position). */
async function checkSlots(
  tripId: string,
  slots: SlotInput[],
): Promise<{ valid: SlotInput[]; rejected: SlotRejection[] }> {
  for (const s of slots) {
    if (!Number.isInteger(s.day) || s.day < 1) throw new InvalidInputError(`Day ${s.day} is not a trip day.`);
    if (!isSlotName(s.slot)) throw new InvalidInputError(`"${s.slot}" is not a slot.`);
  }
  const referenced = [...new Set(slots.map((s) => s.tripPlaceId).filter((id): id is string => !!id))];
  const known = new Map<string, string>();
  const uuids = referenced.filter(isUuid);
  if (uuids.length > 0) {
    const rows = await db
      .select({ id: tripPlaces.id, status: tripPlaces.status })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.tripId, tripId), inArray(tripPlaces.id, uuids)));
    for (const row of rows) known.set(row.id, row.status);
  }

  const rejected: SlotRejection[] = [];
  const byKey = new Map<string, SlotInput>();
  for (const s of slots) {
    const id = s.tripPlaceId;
    if (id && !known.has(id)) {
      rejected.push({ tripPlaceId: id, reason: "This place is not on this trip." });
      continue;
    }
    if (id && known.get(id) === "removed") {
      rejected.push({ tripPlaceId: id, reason: "This place was removed from the trip." });
      continue;
    }
    byKey.set(slotKey(s), s);
  }
  return { valid: [...byKey.values()], rejected };
}

function slotValues(tripId: string, slots: SlotInput[]) {
  return slots.map((s) => ({
    tripId,
    day: s.day,
    date: s.date ?? null,
    slot: s.slot,
    tripPlaceId: s.tripPlaceId ?? null,
    note: s.note?.trim() ?? "",
    position: s.position ?? 0,
  }));
}

const slotTarget = [itinerarySlots.tripId, itinerarySlots.day, itinerarySlots.slot, itinerarySlots.position];

export const setSlots: SetSlots = async (tripId, slots, mode, scope) => {
  await requireTripId(tripId, scope);
  const { valid, rejected } = await checkSlots(tripId, slots);
  const clear = db.delete(itinerarySlots).where(eq(itinerarySlots.tripId, tripId));

  if (valid.length === 0) {
    if (mode === "replace") await db.batch([clear, syncPlaceStatuses(tripId)]);
    return { applied: [], rejected };
  }

  const insert = db.insert(itinerarySlots).values(slotValues(tripId, valid));
  let applied: (typeof itinerarySlots.$inferSelect)[];
  if (mode === "replace") {
    [, applied] = await db.batch([clear, insert.returning(), syncPlaceStatuses(tripId)]);
  } else {
    [applied] = await db.batch([
      insert
        .onConflictDoUpdate({
          target: slotTarget,
          set: {
            tripPlaceId: sql`excluded.trip_place_id`,
            date: sql`coalesce(excluded.date, ${itinerarySlots.date})`,
            note: sql`case when excluded.note = '' then ${itinerarySlots.note} else excluded.note end`,
            updatedAt: sql`now()`,
          },
        })
        .returning(),
      syncPlaceStatuses(tripId),
    ]);
  }
  return { applied: applied.map(toSlot), rejected };
};

export const upsertSlot: UpsertSlot = async (tripId, slot, scope) => {
  await requireTripId(tripId, scope);
  const { valid, rejected } = await checkSlots(tripId, [slot]);
  const value = valid[0];
  if (!value) throw new InvalidInputError(rejected[0]?.reason ?? "That slot cannot be saved.");

  const [rows] = await db.batch([
    db
      .insert(itinerarySlots)
      .values(slotValues(tripId, [value]))
      .onConflictDoUpdate({
        target: slotTarget,
        set: {
          tripPlaceId: sql`excluded.trip_place_id`,
          date: sql`coalesce(excluded.date, ${itinerarySlots.date})`,
          ...(slot.note !== undefined ? { note: sql`excluded.note` } : {}),
          updatedAt: sql`now()`,
        },
      })
      .returning(),
    syncPlaceStatuses(tripId),
  ]);
  return toSlot(single(rows, "slot"));
};

export const clearSlot: ClearSlot = async (slotId, scope) => {
  if (!isUuid(slotId)) throw new NotFoundError("slot");
  const [row] = await db
    .delete(itinerarySlots)
    .where(and(eq(itinerarySlots.id, slotId), inArray(itinerarySlots.tripId, ownedTripIds(scope))))
    .returning({ tripId: itinerarySlots.tripId });
  if (!row) throw new NotFoundError("slot");
  await syncPlaceStatuses(row.tripId);
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

