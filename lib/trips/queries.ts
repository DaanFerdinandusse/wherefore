import "server-only";

import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";

import { inScope, isUuid } from "@/lib/auth/scope";
import { listRecentClients } from "@/lib/clients/queries";
import type { TripPlaceCard, TripSnapshot } from "@/lib/contracts";
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
  GetSharedTripSnapshot,
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
import { computeStage, todayIso, tripDayCount } from "./stage";

// Drizzle prints a single-table select's columns unqualified, which a
// correlated subquery would read as its own. Name the outer row explicitly.
const TRIP_ID = sql.raw(`"trips"."id"`);
const TRAVELER_CLIENT_ID = sql.raw(`"trip_travelers"."client_id"`);

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
    .leftJoin(advisorPlaces, eq(advisorPlaces.id, tripPlaces.advisorPlaceId))
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
      .select()
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
    asks: askRows.map(toAsk),
    slots: slotRows.map(toSlot).sort(compareSlots),
  };
  return snapshot;
};

function asSeedStatus(value: string): TripSnapshot["trip"]["seedStatus"] {
  return value === "running" || value === "done" || value === "failed" ? value : "pending";
}

export const getSharedTripSnapshot: GetSharedTripSnapshot = async (token) => {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select({ id: trips.id, ownerId: trips.ownerId, advisorName: advisors.displayName })
    .from(trips)
    .leftJoin(advisors, eq(advisors.userId, trips.ownerId))
    .where(eq(trips.shareToken, token))
    .limit(1);
  if (!row) return null;
  const snapshot = await getTripSnapshot(row.id, row.ownerId);
  return snapshot ? { snapshot, advisorName: row.advisorName } : null;
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

export const listTrips: ListTrips = async (ownerId) => {
  const rows = await db
    .select({
      trip: trips,
      clientAvatarUrl: clients.avatarUrl,
      imageUrl: sql<string | null>`(
        select p.images -> 0 ->> 'url'
        from trip_places tp
        join places p on p.id = tp.place_id
        where tp.trip_id = ${TRIP_ID} and tp.status <> 'removed' and jsonb_array_length(p.images) > 0
        order by tp.best_score desc nulls last
        limit 1
      )`,
      places: sql<number>`(
        select count(*)::int from trip_places tp where tp.trip_id = ${TRIP_ID} and tp.status <> 'removed'
      )`,
      added: sql<number>`(
        select count(*)::int from trip_places tp where tp.trip_id = ${TRIP_ID} and tp.status = 'added'
      )`,
      filledSlots: sql<number>`(
        select count(*)::int from itinerary_slots s where s.trip_id = ${TRIP_ID} and s.trip_place_id is not null
      )`,
      filledDays: sql<number>`(
        select count(distinct s.day)::int from itinerary_slots s where s.trip_id = ${TRIP_ID} and s.trip_place_id is not null
      )`,
      maxDay: sql<number | null>`(select max(s.day) from itinerary_slots s where s.trip_id = ${TRIP_ID})`,
    })
    .from(trips)
    .leftJoin(clients, eq(clients.id, trips.clientId))
    .where(inScope(trips, ownerId))
    .orderBy(desc(trips.updatedAt));

  const today = todayIso();
  const grouped: TripsByStage = { planning: [], shared: [], traveling: [], done: [] };
  for (const row of rows) {
    const t = row.trip;
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
      stage: computeStage(t, today),
      shareToken: t.shareToken,
      seedStatus: t.seedStatus,
      imageUrl: row.imageUrl,
      counts: {
        places: row.places,
        added: row.added,
        filledSlots: row.filledSlots,
        days,
        emptyDays: Math.max(0, days - row.filledDays),
      },
      updatedAt: t.updatedAt,
    };
    grouped[card.stage].push(card);
  }
  return grouped;
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
