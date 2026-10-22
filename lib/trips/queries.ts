import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";

import { inScope, isUuid } from "@/lib/auth/scope";
import { listRecentClients } from "@/lib/clients/queries";
import type { TripPlaceCard, TripSnapshot, TripStage } from "@/lib/contracts";
import { db } from "@/lib/db";
import {
  advisorPlaces,
  advisors,
  askPlaces,
  clients,
  itinerarySlots,
  places,
  tripAsks,
  tripCalls,
  tripPlaces,
  trips,
  tripTravelers,
} from "@/lib/db/schema";

import type {
  ClientPastDestinations,
  GetSharedTripView,
  GetTrip,
  GetTripSnapshot,
  ListRecentClientsForTripBar,
  ListTripCalls,
  ListTripPlaceCards,
  ListTrips,
  PastDestination,
  TripCard,
  TripsByStage,
} from "./contracts";
import { asCategory, asPlaceStatus, asSource, compareSlots, toAsk, toSlot } from "./map";
import { type SharedSlotRow, toSharedTripView } from "./share";
import { DEV_TRIP_PREFIX } from "./dev";
import { computeStage, isTripStage, todayIso, tripDayCount } from "./stage";

// Drizzle prints a single-table select's columns unqualified, which a
// correlated subquery would read as its own. Name the outer row explicitly.
const TRAVELER_CLIENT_ID = sql.raw(`"trip_travelers"."client_id"`);
const TRIP_ASK_ID = sql.raw(`"trip_asks"."id"`);

export const getTrip: GetTrip = async (id, scope) => {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, id), inScope(trips, scope)))
    .limit(1);
  return row ?? null;
};

// Trip place cards: trip_places + places + the advisor's saved row.

/**
 * "Your place" joins only a saved place of the trip's own owner (or org) for
 * the same place. The write side checks this too (upsertTripPlaces); the read
 * side does not trust stored links.
 */
const yourPlaceJoin = and(
  eq(advisorPlaces.id, tripPlaces.advisorPlaceId),
  eq(advisorPlaces.placeId, tripPlaces.placeId),
  or(
    eq(advisorPlaces.ownerId, trips.ownerId),
    and(isNotNull(trips.orgId), eq(advisorPlaces.orgId, trips.orgId)),
  ),
);

function cardsQuery(where: SQL | undefined) {
  return db
    .select({
      tripPlace: tripPlaces,
      entityId: places.entityId,
      name: places.name,
      neighborhood: places.neighborhood,
      address: places.address,
      lat: places.lat,
      lon: places.lon,
      imageUrl: sql<string | null>`${places.images} -> 0 ->> 'url'`,
      yourPlaceId: advisorPlaces.id,
      yourPlaceNote: advisorPlaces.note,
    })
    .from(tripPlaces)
    .innerJoin(places, eq(places.id, tripPlaces.placeId))
    .innerJoin(trips, eq(trips.id, tripPlaces.tripId))
    .leftJoin(advisorPlaces, yourPlaceJoin)
    .where(where)
    .orderBy(asc(tripPlaces.position), sql`${tripPlaces.bestScore} desc nulls last`, asc(places.name));
}

type CardRow = Awaited<ReturnType<typeof cardsQuery>>[number];

/** Ask tab membership for a trip's live asks, in rank order. */
function membershipQuery(tripId: string) {
  return db
    .select({ askId: askPlaces.askId, tripPlaceId: askPlaces.tripPlaceId })
    .from(askPlaces)
    .innerJoin(tripAsks, eq(tripAsks.id, askPlaces.askId))
    .where(and(eq(tripAsks.tripId, tripId), ne(tripAsks.status, "archived")))
    .orderBy(asc(askPlaces.rank));
}

function askIdsByTripPlace(rows: { askId: string; tripPlaceId: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.tripPlaceId) ?? [];
    list.push(row.askId);
    map.set(row.tripPlaceId, list);
  }
  return map;
}

function toCard(row: CardRow, askIds: string[]): TripPlaceCard {
  const tp = row.tripPlace;
  return {
    tripPlaceId: tp.id,
    placeId: tp.placeId,
    entityId: row.entityId,
    name: row.name,
    category: asCategory(tp.category),
    neighborhood: row.neighborhood ?? undefined,
    address: row.address ?? undefined,
    lat: row.lat ?? undefined,
    lon: row.lon ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    score: tp.bestScore ?? undefined,
    because: tp.explainability,
    sharedTags: tp.sharedTags,
    yourPlace: row.yourPlaceId ? { advisorPlaceId: row.yourPlaceId, note: row.yourPlaceNote ?? "" } : undefined,
    reason: tp.reason ?? undefined,
    status: asPlaceStatus(tp.status),
    source: asSource(tp.source),
    askIds,
  };
}

export const getTripSnapshot: GetTripSnapshot = async (tripId, ownerId) => {
  if (!isUuid(tripId)) return null;
  // One round trip; the children are discarded unless the trip is in scope.
  const [tripRows, travelerRows, cardRows, memberRows, askRows, slotRows] = await db.batch([
    db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), inScope(trips, ownerId)))
      .limit(1),
    db
      .select({
        traveler: tripTravelers,
        favoritesCount: sql<number>`(
          select count(*)::int from client_favorites f where f.client_id = ${TRAVELER_CLIENT_ID}
        )`,
      })
      .from(tripTravelers)
      .where(eq(tripTravelers.tripId, tripId))
      .orderBy(asc(tripTravelers.position)),
    cardsQuery(eq(tripPlaces.tripId, tripId)),
    membershipQuery(tripId),
    db
      .select({
        ask: tripAsks,
        // Counted on read, so concurrent result writes never leave a stale count.
        liveCount: sql<number>`(select count(*)::int from ask_places ap where ap.ask_id = ${TRIP_ASK_ID})`,
      })
      .from(tripAsks)
      .where(and(eq(tripAsks.tripId, tripId), ne(tripAsks.status, "archived")))
      .orderBy(asc(tripAsks.createdAt)),
    db.select().from(itinerarySlots).where(eq(itinerarySlots.tripId, tripId)),
  ]);
  const trip = tripRows[0];
  if (!trip) return null;

  const askIds = askIdsByTripPlace(memberRows);
  const snapshot: TripSnapshot = {
    trip: {
      id: trip.id,
      title: trip.title,
      clientId: trip.clientId,
      clientName: trip.clientName,
      destination: trip.destination,
      startDate: trip.startDate ?? undefined,
      endDate: trip.endDate ?? undefined,
      datesMode: trip.datesMode === "exact" ? "exact" : "unset",
      stage: computeStage(trip),
      shareToken: trip.shareToken ?? undefined,
      seedStatus: asSeedStatus(trip.seedStatus),
      builtFrom: trip.builtFrom ?? undefined,
      chatId: trip.chatId ?? "",
    },
    travelers: travelerRows.map(({ traveler, favoritesCount }) => ({
      id: traveler.id,
      name: traveler.name,
      role: traveler.role === "client" ? "client" : "guest",
      clientId: traveler.clientId ?? undefined,
      favoritesCount: traveler.clientId ? favoritesCount : 0,
    })),
    places: cardRows.map((row) => toCard(row, askIds.get(row.tripPlace.id) ?? [])),
    asks: askRows.map(({ ask, liveCount }) => toAsk(ask, liveCount)),
    slots: slotRows.map(toSlot).sort(compareSlots),
  };
  return snapshot;
};

function asSeedStatus(value: string): TripSnapshot["trip"]["seedStatus"] {
  return value === "running" || value === "done" || value === "failed" ? value : "pending";
}

/**
 * The public traveler view. It never goes through the advisor snapshot: the
 * two selects below name every column the traveler may see, and
 * `toSharedTripView` drops what the page does not show (ids, scores, asks,
 * advisor place notes, slot notes not marked for the traveler). Removed
 * places do not join.
 */
export const getSharedTripView: GetSharedTripView = async (token) => {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const sharedTripId = db.select({ id: trips.id }).from(trips).where(eq(trips.shareToken, token));
  const [tripRows, slotRows] = await db.batch([
    db
      .select({
        title: trips.title,
        destinationName: sql<string>`${trips.destination} ->> 'name'`,
        startDate: trips.startDate,
        endDate: trips.endDate,
        clientName: trips.clientName,
        advisorName: advisors.displayName,
      })
      .from(trips)
      .leftJoin(advisors, eq(advisors.userId, trips.ownerId))
      .where(eq(trips.shareToken, token))
      .limit(1),
    db
      .select({
        day: itinerarySlots.day,
        date: itinerarySlots.date,
        slot: itinerarySlots.slot,
        position: itinerarySlots.position,
        note: itinerarySlots.note,
        noteForTraveler: itinerarySlots.noteForTraveler,
        noteSource: itinerarySlots.noteSource,
        placeName: places.name,
        category: tripPlaces.category,
        imageUrl: sql<string | null>`${places.images} -> 0 ->> 'url'`,
        neighborhood: places.neighborhood,
        explainability: tripPlaces.explainability,
        sharedTags: tripPlaces.sharedTags,
        reason: tripPlaces.reason,
      })
      .from(itinerarySlots)
      .leftJoin(
        tripPlaces,
        and(eq(tripPlaces.id, itinerarySlots.tripPlaceId), ne(tripPlaces.status, "removed")),
      )
      .leftJoin(places, eq(places.id, tripPlaces.placeId))
      .where(inArray(itinerarySlots.tripId, sharedTripId)),
  ]);
  const trip = tripRows[0];
  if (!trip) return null;

  const slots: SharedSlotRow[] = slotRows.map((row) => ({
    day: row.day,
    date: row.date,
    slot: row.slot,
    position: row.position,
    note: row.note,
    noteForTraveler: row.noteForTraveler,
    noteSource: row.noteSource,
    place:
      row.placeName === null
        ? null
        : {
            name: row.placeName,
            category: row.category ?? "other",
            imageUrl: row.imageUrl,
            neighborhood: row.neighborhood,
            explainability: row.explainability ?? [],
            sharedTags: row.sharedTags ?? [],
            reason: row.reason,
          },
  }));
  return toSharedTripView(trip, slots);
};

export const listTripPlaceCards: ListTripPlaceCards = async (tripId, scope, options = {}) => {
  const trip = await getTrip(tripId, scope);
  if (!trip) return [];
  const tripPlaceIds = options.tripPlaceIds?.filter(isUuid);
  const placeIds = options.placeIds?.filter(isUuid);
  if ((tripPlaceIds && tripPlaceIds.length === 0) || (placeIds && placeIds.length === 0)) return [];
  const [cardRows, memberRows] = await db.batch([
    cardsQuery(
      and(
        eq(tripPlaces.tripId, tripId),
        tripPlaceIds ? inArray(tripPlaces.id, tripPlaceIds) : undefined,
        placeIds ? inArray(tripPlaces.placeId, placeIds) : undefined,
      ),
    ),
    membershipQuery(tripId),
  ]);
  const askIds = askIdsByTripPlace(memberRows);
  return cardRows.map((row) => toCard(row, askIds.get(row.tripPlace.id) ?? []));
};

export const DEFAULT_TRIPS_PER_STAGE = 30;
const MAX_TRIPS_PER_STAGE = 100;

/**
 * computeStage (stage.ts) as SQL, so the board can page each stage in the
 * database. Keep the two in step; the board test checks they agree.
 */
export function stageSql(today: string): SQL<TripStage> {
  const end = sql`coalesce(${trips.endDate}, ${trips.startDate})`;
  const day = sql`${today}::date`;
  return sql<TripStage>`case
    when ${trips.stageOverride} in ('planning', 'shared', 'traveling', 'done') then ${trips.stageOverride}
    when ${end} is not null and ${day} > ${end} then 'done'
    when ${trips.startDate} is not null and ${day} >= ${trips.startDate} and (${end} is null or ${day} <= ${end}) then 'traveling'
    when ${trips.shareToken} is not null then 'shared'
    else 'planning'
  end`;
}

/**
 * The Trips board. One statement: the scoped trips ranked per stage, the
 * requested page of each stage, and the card aggregates as grouped joins over
 * that page only (no per-trip subqueries).
 */
export const listTrips: ListTrips = async (ownerId, options = {}) => {
  const perStage = Math.min(Math.max(1, Math.floor(options.perStage ?? DEFAULT_TRIPS_PER_STAGE)), MAX_TRIPS_PER_STAGE);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const today = todayIso();
  const stage = stageSql(today);
  const devTitle = sql`starts_with(${trips.title}, ${DEV_TRIP_PREFIX})`;
  const devFilter = options.dev === "only" ? devTitle : sql`not ${devTitle}`;

  const ranked = db.$with("ranked").as(
    db
      .select({
        id: trips.id,
        stage: sql<TripStage>`${stage}`.as("stage"),
        rn: sql<number>`row_number() over (partition by ${stage} order by ${trips.updatedAt} desc, ${trips.id})`.as("rn"),
        total: sql<number>`count(*) over (partition by ${stage})`.as("total"),
      })
      .from(trips)
      .where(and(inScope(trips, ownerId), devFilter)),
  );
  const page = db.$with("page").as(
    db
      .select()
      .from(ranked)
      .where(and(sql`${ranked.rn} > ${offset}`, sql`${ranked.rn} <= ${offset + perStage}`)),
  );
  const pageIds = db.select({ id: page.id }).from(page);

  const placeCounts = db
    .select({
      tripId: tripPlaces.tripId,
      places: sql<number>`(count(*) filter (where ${tripPlaces.status} <> 'removed'))::int`.as("places"),
      added: sql<number>`(count(*) filter (where ${tripPlaces.status} = 'added'))::int`.as("added"),
    })
    .from(tripPlaces)
    .where(inArray(tripPlaces.tripId, pageIds))
    .groupBy(tripPlaces.tripId)
    .as("place_counts");

  const slotCounts = db
    .select({
      tripId: itinerarySlots.tripId,
      filledSlots: sql<number>`(count(*) filter (where ${itinerarySlots.tripPlaceId} is not null))::int`.as(
        "filled_slots",
      ),
      filledDays: sql<number>`(count(distinct ${itinerarySlots.day}) filter (where ${itinerarySlots.tripPlaceId} is not null))::int`.as(
        "filled_days",
      ),
      maxDay: sql<number | null>`max(${itinerarySlots.day})`.as("max_day"),
    })
    .from(itinerarySlots)
    .where(inArray(itinerarySlots.tripId, pageIds))
    .groupBy(itinerarySlots.tripId)
    .as("slot_counts");

  // The city photo: the first image of the best scored place still on the trip.
  const covers = db
    .selectDistinctOn([tripPlaces.tripId], {
      tripId: tripPlaces.tripId,
      imageUrl: sql<string | null>`${places.images} -> 0 ->> 'url'`.as("image_url"),
    })
    .from(tripPlaces)
    .innerJoin(places, eq(places.id, tripPlaces.placeId))
    .where(
      and(
        inArray(tripPlaces.tripId, pageIds),
        ne(tripPlaces.status, "removed"),
        sql`jsonb_array_length(${places.images}) > 0`,
      ),
    )
    .orderBy(tripPlaces.tripId, sql`${tripPlaces.bestScore} desc nulls last`)
    .as("covers");

  const rows = await db
    .with(ranked, page)
    .select({
      trip: trips,
      stage: page.stage,
      total: page.total,
      clientAvatarUrl: clients.avatarUrl,
      imageUrl: covers.imageUrl,
      places: placeCounts.places,
      added: placeCounts.added,
      filledSlots: slotCounts.filledSlots,
      filledDays: slotCounts.filledDays,
      maxDay: slotCounts.maxDay,
    })
    .from(page)
    .innerJoin(trips, eq(trips.id, page.id))
    .leftJoin(clients, eq(clients.id, trips.clientId))
    .leftJoin(placeCounts, eq(placeCounts.tripId, trips.id))
    .leftJoin(slotCounts, eq(slotCounts.tripId, trips.id))
    .leftJoin(covers, eq(covers.tripId, trips.id))
    .orderBy(desc(trips.updatedAt), asc(trips.id));

  const board: TripsByStage = {
    planning: { trips: [], total: 0, hasMore: false },
    shared: { trips: [], total: 0, hasMore: false },
    traveling: { trips: [], total: 0, hasMore: false },
    done: { trips: [], total: 0, hasMore: false },
  };
  for (const row of rows) {
    const t = row.trip;
    const cardStage = isTripStage(row.stage) ? row.stage : computeStage(t, today);
    const days = tripDayCount(t, row.maxDay);
    const card: TripCard = {
      id: t.id,
      title: t.title,
      clientId: t.clientId,
      clientName: t.clientName,
      clientAvatarUrl: row.clientAvatarUrl,
      destination: t.destination,
      startDate: t.startDate,
      endDate: t.endDate,
      datesMode: t.datesMode,
      adults: t.adults,
      children: t.children,
      stage: cardStage,
      stageOverride: isTripStage(t.stageOverride) ? t.stageOverride : null,
      shareToken: t.shareToken,
      seedStatus: t.seedStatus,
      imageUrl: row.imageUrl ?? null,
      counts: {
        places: row.places ?? 0,
        added: row.added ?? 0,
        filledSlots: row.filledSlots ?? 0,
        days,
        emptyDays: Math.max(0, days - (row.filledDays ?? 0)),
      },
      updatedAt: t.updatedAt,
    };
    const column = board[cardStage];
    column.trips.push(card);
    column.total = Number(row.total);
    column.hasMore = Number(row.total) > offset + perStage;
  }
  return board;
};

export const listRecentClientsForTripBar: ListRecentClientsForTripBar = (ownerId, limit = 4) =>
  listRecentClients(ownerId, limit);

export const clientPastDestinations: ClientPastDestinations = async (clientId, scope) => {
  if (!isUuid(clientId)) return [];
  const rows = await db
    .select({
      id: trips.id,
      destination: trips.destination,
      startDate: trips.startDate,
    })
    .from(trips)
    .where(
      and(
        eq(trips.clientId, clientId),
        inScope(trips, scope),
        sql`coalesce(${trips.endDate}, ${trips.startDate}) < current_date`,
      ),
    )
    .orderBy(sql`${trips.startDate} desc nulls last`, desc(trips.createdAt));

  const byName = new Map<string, PastDestination>();
  for (const row of rows) {
    const key = row.destination.name.trim().toLowerCase();
    const seen = byName.get(key);
    if (seen) {
      seen.tripCount += 1;
      continue;
    }
    byName.set(key, { ...row.destination, lastTripId: row.id, lastStartDate: row.startDate, tripCount: 1 });
  }
  return [...byName.values()];
};

export const listTripCalls: ListTripCalls = async (tripId, scope) => {
  const trip = await getTrip(tripId, scope);
  if (!trip) return [];
  return db
    .select()
    .from(tripCalls)
    .where(eq(tripCalls.tripId, tripId))
    .orderBy(asc(tripCalls.createdAt));
};
