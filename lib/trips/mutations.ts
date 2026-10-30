import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, getTableColumns, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";

import { InvalidInputError, NotFoundError } from "@/lib/auth/errors";
import type { Explainability } from "@/lib/contracts";
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
  RecordShareOpen,
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
  TripPlace,
  TripPlaceUpsert,
  WriteOptions,
} from "./contracts";
import { defaultTripTitle, isSlotName, toAsk, toSlot } from "./map";
import { foldTripPlaces, SOURCE_PRIORITY } from "./merge";
import { guardOrTrue, insertSelect, TurnLostError, turnGuardSql, type TurnGuard } from "./turn-guard";

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

/**
 * A guarded write matched nothing: TurnLostError when the guard is what
 * failed (it never turns true again for that turn), otherwise nothing.
 */
async function assertGuardHeld(turn: TurnGuard | undefined): Promise<void> {
  if (!turn) return;
  const result = (await db.execute(sql`select ${turnGuardSql(turn)} as held`)) as unknown as {
    rows: { held: boolean }[];
  };
  if (!result.rows[0]?.held) throw new TurnLostError();
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
    // A link created now has its opens recorded from the start.
    shareOpensTracked: sql`(${trips.shareToken} is null or ${trips.shareOpensTracked})`,
  });

export const revokeShare: RevokeShare = (id, scope) =>
  setTripColumns(id, scope, {
    shareToken: null,
    sharedAt: null,
    shareFirstOpenedAt: null,
    shareLastOpenedAt: null,
    shareOpensTracked: false,
  });

export const recordShareOpen: RecordShareOpen = async (token, viewer) => {
  if (!token) return;
  await db
    .update(trips)
    .set({
      shareFirstOpenedAt: sql`coalesce(${trips.shareFirstOpenedAt}, now())`,
      shareLastOpenedAt: sql`now()`,
    })
    // coalesce: a null org_id makes the scope predicate null, not false.
    .where(and(eq(trips.shareToken, token), viewer ? sql`not coalesce((${inScope(trips, viewer)}), false)` : undefined));
};

export const setStageOverride: SetStageOverride = (id, stage, scope) =>
  setTripColumns(id, scope, { stageOverride: stage });

// Trip places

const PRIORITY = sql.raw(`array[${SOURCE_PRIORITY.map((s) => `'${s}'`).join(", ")}]::text[]`);
const ex = (column: string) => sql.raw(`excluded.${column}`);

/** One trip place row as the insert source reads it from jsonb. */
type TripPlaceRecord = {
  place_id: string;
  source: string;
  category: string;
  best_affinity: number | null;
  best_score: number | null;
  signal_hash: string | null;
  explainability: unknown;
  shared_tags: unknown;
  advisor_place_id: string | null;
  reason: string | null;
  position: number;
};

function toTripPlaceRecord(row: TripPlaceUpsert): TripPlaceRecord {
  return {
    place_id: row.placeId,
    source: row.source,
    category: row.category,
    best_affinity: row.bestAffinity ?? null,
    best_score: row.bestScore ?? null,
    signal_hash: row.signalHash ?? null,
    explainability: row.explainability ?? [],
    shared_tags: row.sharedTags ?? [],
    advisor_place_id: row.advisorPlaceId && isUuid(row.advisorPlaceId) ? row.advisorPlaceId : null,
    reason: row.reason ?? null,
    position: row.position ?? 0,
  };
}

// The incoming row is the better evidence (evidence.ts beatsEvidence, in
// SQL): an affinity beats none; a newer signal set replaces the old one;
// within one signal set the higher affinity wins, never the higher rank of a
// smaller result set.
const BETTER = sql`(case
  when excluded.best_affinity is null then (
    ${tripPlaces.bestAffinity} is null and excluded.best_score is not null
    and (${tripPlaces.bestScore} is null or excluded.best_score > ${tripPlaces.bestScore})
  )
  when ${tripPlaces.bestAffinity} is null then true
  when excluded.signal_hash is not null and ${tripPlaces.signalHash} is distinct from excluded.signal_hash then true
  else excluded.best_affinity > ${tripPlaces.bestAffinity}
end)`;

/**
 * The trip places upsert as one statement, not yet run: a jsonb source, the
 * advisor place link checked in the insert itself (the id only sticks when
 * that saved place is in the caller's scope and saves this same place, so a
 * card can never show someone else's private note), and the turn guard.
 */
function tripPlacesUpsert(tripId: string, rows: TripPlaceUpsert[], scope: ScopeInput, turn: TurnGuard | undefined) {
  const records = rows.map(toTripPlaceRecord);
  const advisorLink = sql`(${db
    .select({ id: advisorPlaces.id })
    .from(advisorPlaces)
    .where(
      and(
        sql`${advisorPlaces.id} = r.advisor_place_id`,
        sql`${advisorPlaces.placeId} = r.place_id`,
        inScope(advisorPlaces, scope),
      ),
    )})`;
  const source = insertSelect(
    tripPlaces,
    {
      tripId: sql`${tripId}::uuid`,
      placeId: sql`r.place_id`,
      source: sql`r.source`,
      category: sql`r.category`,
      bestAffinity: sql`r.best_affinity`,
      bestScore: sql`r.best_score`,
      signalHash: sql`r.signal_hash`,
      explainability: sql`coalesce(r.explainability, '[]'::jsonb)`,
      sharedTags: sql`coalesce(r.shared_tags, '[]'::jsonb)`,
      advisorPlaceId: sql`case when r.advisor_place_id is null then null else ${advisorLink} end`,
      reason: sql`r.reason`,
      position: sql`coalesce(r.position, 0)`,
    },
    sql`jsonb_to_recordset(${JSON.stringify(records)}::jsonb) as r(
      place_id uuid, source text, category text, best_affinity numeric, best_score int, signal_hash text,
      explainability jsonb, shared_tags jsonb, advisor_place_id uuid, reason text, position int
    )`,
    guardOrTrue(turn, tripId),
  );
  const pick = (column: string, current: SQL) => sql`case when ${BETTER} then ${ex(column)} else ${current} end`;
  return db
    .insert(tripPlaces)
    .select(source)
    .onConflictDoUpdate({
      target: [tripPlaces.tripId, tripPlaces.placeId],
      set: {
        source: sql`case when array_position(${PRIORITY}, ${ex("source")}) > array_position(${PRIORITY}, ${tripPlaces.source}) then ${ex("source")} else ${tripPlaces.source} end`,
        category: sql`case when ${tripPlaces.category} = 'other' then ${ex("category")} else ${tripPlaces.category} end`,
        bestScore: pick("best_score", sql`${tripPlaces.bestScore}`),
        bestAffinity: pick("best_affinity", sql`${tripPlaces.bestAffinity}`),
        signalHash: pick("signal_hash", sql`${tripPlaces.signalHash}`),
        explainability: pick("explainability", sql`${tripPlaces.explainability}`),
        sharedTags: pick("shared_tags", sql`${tripPlaces.sharedTags}`),
        advisorPlaceId: sql`coalesce(${ex("advisor_place_id")}, ${tripPlaces.advisorPlaceId})`,
        reason: sql`coalesce(${ex("reason")}, ${tripPlaces.reason})`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: tripPlaces.id, placeId: tripPlaces.placeId });
}

export const upsertTripPlaces: UpsertTripPlaces = async (tripId, rows, scope, options = {}) => {
  await requireTripId(tripId, scope);
  const folded = foldTripPlaces(rows.filter((row) => isUuid(row.placeId)));
  if (folded.length === 0) return {};
  const returned = await tripPlacesUpsert(tripId, folded, scope, options.turn);
  if (returned.length === 0) await assertGuardHeld(options.turn);
  return Object.fromEntries(returned.map((row) => [row.placeId, row.id]));
};

/** What saveReplacement writes. */
export type ReplacementInput = {
  removedTripPlaceId: string;
  /** The idempotency key, a tool call id. Null for a replacement asked from the UI. */
  key: string | null;
  place: TripPlaceUpsert;
  /** The ask tab the removed place was in: the replacement joins it at `rank`. */
  ask?: { askId: string; rank: number; affinity?: number | null; score?: number | null; explainability?: Explainability };
};

/**
 * The replacement for a removed trip place, in one transaction: the new trip
 * place, the link on the removed one (`replaced_by`, `replacement_key`) and,
 * when the removed place was in an ask tab, the new place's row in that tab.
 * A retry with the same key finds the link and returns the same replacement
 * (lib/agent/tools/place-tools.ts, replace.ts), so it is never added twice.
 * Returns the replacement's trip place id, null when nothing was written.
 */
export async function saveReplacement(
  tripId: string,
  input: ReplacementInput,
  scope: ScopeInput,
  options: WriteOptions = {},
): Promise<string | null> {
  await requireTripId(tripId, scope);
  if (!isUuid(input.removedTripPlaceId) || !isUuid(input.place.placeId)) throw new NotFoundError("trip place");
  const guard = guardOrTrue(options.turn, tripId);
  const newId = sql`(select tp.id from trip_places tp where tp.trip_id = ${tripId}::uuid and tp.place_id = ${input.place.placeId}::uuid)`;
  const upsert = tripPlacesUpsert(tripId, [input.place], scope, options.turn);
  const link = db
    .update(tripPlaces)
    .set({ replacedBy: newId, replacementKey: input.key, updatedAt: sql`now()` })
    .where(and(eq(tripPlaces.id, input.removedTripPlaceId), eq(tripPlaces.tripId, tripId), guard))
    .returning({ replacedBy: tripPlaces.replacedBy });
  const ask = input.ask;
  const [written, linked] =
    ask && isUuid(ask.askId)
      ? await db.batch([
          upsert,
          link,
          db
            .insert(askPlaces)
            .select(
              insertSelect(
                askPlaces,
                {
                  askId: sql`${ask.askId}::uuid`,
                  tripPlaceId: newId,
                  rank: sql`${ask.rank}::int`,
                  affinity: sql`${ask.affinity ?? null}::numeric`,
                  score: sql`${ask.score ?? null}::int`,
                  explainability: sql`${JSON.stringify(ask.explainability ?? [])}::jsonb`,
                },
                sql`${tripAsks}`,
                and(eq(tripAsks.id, ask.askId), eq(tripAsks.tripId, tripId), guard) as SQL,
              ),
            )
            .onConflictDoNothing(),
        ])
      : await db.batch([upsert, link]);
  const id = written[0]?.id ?? null;
  if (!id || linked.length === 0) {
    await assertGuardHeld(options.turn);
    return null;
  }
  return id;
}

export const setTripPlaceStatus: SetTripPlaceStatus = async (tripPlaceId, status, scope, options = {}) => {
  if (!isUuid(tripPlaceId)) throw new NotFoundError("trip place");
  const where = and(
    eq(tripPlaces.id, tripPlaceId),
    inArray(tripPlaces.tripId, ownedTripIds(scope)),
    guardOrTrue(options.turn, sql`${tripPlaces.tripId}`),
  );
  const update = db
    .update(tripPlaces)
    .set({ status, updatedAt: sql`now()` })
    .where(where)
    .returning();
  let rows: TripPlace[];
  if (status !== "removed") {
    rows = await update;
  } else {
    [rows] = await db.batch([
      update,
      db
        .update(itinerarySlots)
        .set({ tripPlaceId: null, updatedAt: sql`now()` })
        .where(
          and(
            eq(itinerarySlots.tripPlaceId, tripPlaceId),
            inArray(itinerarySlots.tripId, ownedTripIds(scope)),
            guardOrTrue(options.turn, sql`${itinerarySlots.tripId}`),
          ),
        ),
    ]);
  }
  if (rows.length === 0) await assertGuardHeld(options.turn);
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

export const createAsk: CreateAsk = async (tripId, input, scope, options = {}) => {
  await requireTripId(tripId, scope);
  const turn = options.turn;
  const source = insertSelect(
    tripAsks,
    {
      tripId: sql`${tripId}::uuid`,
      label: sql`${input.label.trim()}::text`,
      query: sql`${JSON.stringify(input.query ?? {})}::jsonb`,
      toolCallId: sql`${input.toolCallId ?? null}::text`,
      chatMessageId: sql`${input.chatMessageId ?? null}::text`,
      status: sql`${input.status ?? "running"}::text`,
      turnId: sql`${turn?.turnId ?? null}::text`,
    },
    sql`(select 1) as one`,
    guardOrTrue(turn, tripId),
  );
  const rows = await db
    .insert(tripAsks)
    .select(source)
    .onConflictDoUpdate({
      target: tripAsks.toolCallId,
      // A retried tool call returns its ask; a clash with another trip's ask returns nothing.
      set: { updatedAt: sql`now()` },
      setWhere: eq(tripAsks.tripId, tripId),
    })
    .returning(askWithCount);
  if (rows.length === 0) await assertGuardHeld(turn);
  const row = single(rows, "ask");
  return toAsk(row, row.liveCount);
};

/**
 * Patch an ask. `result_count` is the final count, written once: when the
 * ask moves to "done" without an explicit count, the number of its
 * ask_places rows is stored. The returned Ask carries the live count.
 */
export const updateAsk: UpdateAsk = async (askId, patch, scope, options = {}) => {
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
    .where(and(ownedAsk(askId, scope), guardOrTrue(options.turn, sql`${tripAsks.tripId}`)))
    .returning(askWithCount);
  if (rows.length === 0) await assertGuardHeld(options.turn);
  const row = single(rows, "ask");
  return toAsk(row, row.liveCount);
};

export const archiveAsk: ArchiveAsk = (askId, scope) => updateAsk(askId, { status: "archived" }, scope);

export const addAskPlaces: AddAskPlaces = async (askId, rows, scope, options = {}) => {
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
  const guard = guardOrTrue(options.turn, ask.tripId);
  // `replace`: these rows are the whole result set, so a retried tool call
  // that found fewer places leaves none of the first attempt's behind.
  const keep = values.map((v) => v.tripPlaceId);
  const prune = db
    .delete(askPlaces)
    .where(
      and(
        eq(askPlaces.askId, askId),
        keep.length > 0 ? sql`not (${askPlaces.tripPlaceId} = any(${`{${keep.join(",")}}`}::uuid[]))` : sql`true`,
        guard,
      ),
    );
  if (values.length === 0) {
    if (options.replace) await prune;
    return { added: 0, rejected };
  }
  const insert = db
    .insert(askPlaces)
    .select(
      insertSelect(
        askPlaces,
        {
          askId: sql`${askId}::uuid`,
          tripPlaceId: sql`r.trip_place_id`,
          rank: sql`r.rank`,
          affinity: sql`r.affinity`,
          score: sql`r.score`,
          explainability: sql`coalesce(r.explainability, '[]'::jsonb)`,
        },
        sql`jsonb_to_recordset(${JSON.stringify(
          values.map((v) => ({
            trip_place_id: v.tripPlaceId,
            rank: v.rank,
            affinity: v.affinity,
            score: v.score,
            explainability: v.explainability,
          })),
        )}::jsonb) as r(trip_place_id uuid, rank int, affinity numeric, score int, explainability jsonb)`,
        guard,
      ),
    )
    .onConflictDoUpdate({
      target: [askPlaces.askId, askPlaces.tripPlaceId],
      set: {
        rank: sql`excluded.rank`,
        affinity: sql`excluded.affinity`,
        score: sql`excluded.score`,
        explainability: sql`excluded.explainability`,
      },
    })
    .returning({ id: askPlaces.id });
  const inserted = options.replace ? (await db.batch([prune, insert]))[1] : await insert;
  if (inserted.length === 0) await assertGuardHeld(options.turn);
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
  note_source: "advisor" | "agent";
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
    // An agent note is for the advisor only, whatever the caller asked.
    note_for_traveler: s.noteSource === "agent" ? false : (s.noteForTraveler ?? false),
    note_source: s.noteSource ?? "advisor",
    position: s.position ?? 0,
  };
}

/**
 * The insert source: input rows whose trip place is on this trip and not
 * removed (or that name no place), one per (day, slot, position), the last
 * one winning. Columns follow the itinerary_slots column order.
 */
function slotSource(tripId: string, rows: SlotRow[], turn: TurnGuard | undefined): SQL {
  return insertSelect(
    itinerarySlots,
    {
      tripId: sql`${tripId}::uuid`,
      day: sql`v.day`,
      date: sql`v.date`,
      slot: sql`v.slot`,
      tripPlaceId: sql`v.trip_place_id`,
      note: sql`v.note`,
      noteForTraveler: sql`v.note_for_traveler`,
      noteSource: sql`v.note_source`,
      position: sql`v.position`,
    },
    sql`(
      select distinct on (r.day, r.slot, r.position) r.*
      from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
        ord int, day int, date date, slot text, trip_place_id uuid,
        note text, note_for_traveler boolean, note_source text, position int
      )
      where r.trip_place_id is null or exists (
        select 1 from trip_places tp
        where tp.id = r.trip_place_id and tp.trip_id = ${tripId}::uuid and tp.status <> 'removed'
        for share
      )
      order by r.day, r.slot, r.position, r.ord desc
    ) v`,
    guardOrTrue(turn, tripId),
  );
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
      noteSource: sql`case when excluded.note = '' then ${itinerarySlots.noteSource} else excluded.note_source end`,
    };
  }
  if (mode === "single" && noteGiven) {
    return {
      note: sql`excluded.note`,
      noteForTraveler: sql`excluded.note_for_traveler`,
      noteSource: sql`excluded.note_source`,
    };
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
  turn?: TurnGuard,
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
  const clear = db.delete(itinerarySlots).where(and(eq(itinerarySlots.tripId, tripId), guardOrTrue(turn, tripId)));
  const insert = db.insert(itinerarySlots).select(slotSource(tripId, rows, turn));

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

  if (rows.length > 0 && applied.length === 0) await assertGuardHeld(turn);
  const statuses = new Map(known.map((row) => [row.id, row.status]));
  return { applied: applied.map(toSlot), rejected: slotRejections(slots, statuses, applied) };
}

export const setSlots: SetSlots = async (tripId, slots, mode, scope, options = {}) => {
  await requireTripId(tripId, scope);
  return writeSlots(tripId, slots, mode, true, options.turn);
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

/**
 * One call log row. With `key` (agent calls) the row is upserted on
 * (tool call, step, index), so a retried step rewrites its rows instead of
 * adding duplicates; with a turn guard it lands only while the turn holds.
 */
export const logTripCall: LogTripCall = async (tripId, call, scope, options = {}) => {
  await requireTripId(tripId, scope);
  const key = call.key;
  const source = insertSelect(
    tripCalls,
    {
      tripId: sql`${tripId}::uuid`,
      endpoint: sql`${call.endpoint}::text`,
      params: sql`${JSON.stringify(call.params ?? {})}::jsonb`,
      count: sql`${Math.round(call.count ?? 0)}::int`,
      ms: sql`${Math.round(call.ms ?? 0)}::int`,
      loosened: sql`${JSON.stringify(call.loosened ?? [])}::jsonb`,
      source: sql`${call.source ?? "manual"}::text`,
      toolCallId: sql`${key?.toolCallId ?? null}::text`,
      step: sql`${key?.step ?? null}::text`,
      idx: sql`${key?.index ?? null}::int`,
    },
    sql`(select 1) as one`,
    guardOrTrue(options.turn, tripId),
  );
  const insert = db.insert(tripCalls).select(source);
  const rows = await (key
    ? insert
        .onConflictDoUpdate({
          target: [tripCalls.toolCallId, tripCalls.step, tripCalls.idx],
          set: {
            endpoint: sql`excluded.endpoint`,
            params: sql`excluded.params`,
            count: sql`excluded.count`,
            ms: sql`excluded.ms`,
            loosened: sql`excluded.loosened`,
            source: sql`excluded.source`,
          },
          setWhere: eq(tripCalls.tripId, tripId),
        })
        .returning()
    : insert.returning());
  if (rows.length === 0) await assertGuardHeld(options.turn);
  return single(rows, "trip");
};

