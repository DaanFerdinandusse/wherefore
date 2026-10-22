import "server-only";

import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";

import type { Category, TripContextOutput } from "@/lib/contracts";
import { db } from "@/lib/db";
import { clientFavorites, clients, itinerarySlots, places, tripAsks, tripPlaces, trips, tripTravelers } from "@/lib/db/schema";
import { listAdvisorPlaces } from "@/lib/places";
import { haversineM, MAX_DISTANCE_FACTOR } from "@/lib/qloo/normalize";
import { computeStage } from "@/lib/trips";
import { toAsk, toSlot } from "@/lib/trips/map";

// What the agent knows about the trip: the get_trip_context tool output and
// the header of the system prompt (TripContextOutput in lib/contracts.ts).
// Compact by construction: every list is capped and long text clipped, and
// a final size check drops the longest lists first, so the JSON stays under
// about 3k tokens. Editable text (names, rules, notes) is data: the prompt
// and the tool wrap it in a <trip_data> block (tools/model-output.ts).

const MAX_FAVORITES = 8;
const MAX_TAGS = 8;
const MAX_RULES = 8;
const MAX_ADVISOR_PLACES = 15;
const MAX_ASKS = 10;
const MAX_SLOTS = 30;
const MAX_NOTE = 140;
/** About 3k tokens at 4 characters a token. */
export const MAX_CONTEXT_CHARS = 11_000;

const clip = (text: string, max = MAX_NOTE) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Drops the tail of the longest lists until the JSON fits. Pure. */
export function fitContext(context: TripContextOutput, maxChars = MAX_CONTEXT_CHARS): TripContextOutput {
  const out: TripContextOutput = structuredClone(context);
  const size = () => JSON.stringify(out).length;
  let guard = 200;
  while (size() > maxChars && guard-- > 0) {
    if (out.itinerary.length > 10) out.itinerary.pop();
    else if (out.advisorPlaces.length > 5) out.advisorPlaces.pop();
    else if (out.board.asks.length > 3) out.board.asks.shift();
    else if (out.travelers.some((t) => t.favorites.length > 3 || t.tasteTags.length > 3)) {
      for (const t of out.travelers) {
        if (t.favorites.length > 3) t.favorites.pop();
        if (t.tasteTags.length > 3) t.tasteTags.pop();
      }
    } else if (out.itinerary.length > 0) out.itinerary.pop();
    else if (out.advisorPlaces.length > 0) out.advisorPlaces.pop();
    else break;
  }
  return out;
}

/** @returns undefined when the trip does not exist. */
export async function loadTripContext(tripId: string): Promise<TripContextOutput | undefined> {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return undefined;
  const scope = { ownerId: trip.ownerId, orgIds: trip.orgId ? [trip.orgId] : [] };

  const [travelerRows, placeCounts, askRows, slotRows, saved] = await Promise.all([
    db.select().from(tripTravelers).where(eq(tripTravelers.tripId, tripId)).orderBy(asc(tripTravelers.position)),
    db
      .select({ category: tripPlaces.category, n: count() })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.tripId, tripId), ne(tripPlaces.status, "removed")))
      .groupBy(tripPlaces.category),
    db
      .select({
        ask: tripAsks,
        liveCount: sql<number>`(select count(*)::int from ask_places ap where ap.ask_id = "trip_asks"."id")`,
      })
      .from(tripAsks)
      .where(and(eq(tripAsks.tripId, tripId), ne(tripAsks.status, "archived")))
      .orderBy(asc(tripAsks.createdAt)),
    db
      .select()
      .from(itinerarySlots)
      .where(eq(itinerarySlots.tripId, tripId))
      .orderBy(asc(itinerarySlots.day), asc(itinerarySlots.position))
      .limit(MAX_SLOTS),
    listAdvisorPlaces(scope, { limit: 500 }),
  ]);

  const clientIds = [
    ...new Set([trip.clientId, ...travelerRows.map((t) => t.clientId).filter((id): id is string => id !== null)]),
  ];
  const [clientRows, favoriteRows] = await Promise.all([
    db.select().from(clients).where(inArray(clients.id, clientIds)),
    db
      .select({ clientId: clientFavorites.clientId, query: clientFavorites.query, name: places.name })
      .from(clientFavorites)
      .leftJoin(places, eq(places.id, clientFavorites.placeId))
      .where(inArray(clientFavorites.clientId, clientIds))
      .orderBy(asc(clientFavorites.position)),
  ]);

  // The advisor's places in this city, with their current score on this trip.
  const destination = trip.destination;
  const inCity = saved
    .filter(
      (p) =>
        p.city.trim().toLowerCase() === destination.name.trim().toLowerCase() ||
        (p.lat !== null &&
          p.lon !== null &&
          haversineM(p.lat, p.lon, destination.lat, destination.lon) <= destination.radiusM * MAX_DISTANCE_FACTOR),
    )
    .slice(0, MAX_ADVISOR_PLACES);
  const scoreRows =
    inCity.length === 0
      ? []
      : await db
          .select({ advisorPlaceId: tripPlaces.advisorPlaceId, score: tripPlaces.bestScore })
          .from(tripPlaces)
          .where(
            and(
              eq(tripPlaces.tripId, tripId),
              inArray(
                tripPlaces.advisorPlaceId,
                inCity.map((p) => p.id),
              ),
            ),
          );
  const scoreOf = new Map(scoreRows.map((r) => [r.advisorPlaceId, r.score]));

  const clientById = new Map(clientRows.map((c) => [c.id, c]));
  const travelerList =
    travelerRows.length > 0
      ? travelerRows.map((t) => ({ name: t.name, role: t.role, drivesSearch: t.drivesSearch, clientId: t.clientId }))
      : [{ name: trip.clientName, role: "client", drivesSearch: true, clientId: trip.clientId }];

  const board = new Map<Category, number>();
  for (const row of placeCounts) board.set(row.category as Category, (board.get(row.category as Category) ?? 0) + row.n);

  const context: TripContextOutput = {
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
      seedStatus:
        trip.seedStatus === "running" || trip.seedStatus === "done" || trip.seedStatus === "failed"
          ? trip.seedStatus
          : "pending",
      ...(trip.builtFrom ? { builtFrom: trip.builtFrom } : {}),
      chatId: trip.chatId ?? "",
    },
    party: { adults: trip.adults, children: trip.children },
    travelers: travelerList.map((t) => {
      const profile = t.clientId ? clientById.get(t.clientId) : undefined;
      return {
        name: t.name,
        role: t.role,
        drivesSearch: t.drivesSearch,
        favorites: t.clientId
          ? favoriteRows
              .filter((f) => f.clientId === t.clientId)
              .slice(0, MAX_FAVORITES)
              .map((f) => clip(f.name ?? f.query, 60))
          : [],
        tasteTags: (profile?.tasteTags ?? []).slice(0, MAX_TAGS).map((tag) => tag.name),
        rules: (profile?.groundRules ?? []).slice(0, MAX_RULES).map((rule) => clip(rule)),
      };
    }),
    advisorPlaces: inCity.map((p) => {
      const score = scoreOf.get(p.id);
      return { placeId: p.placeId, name: p.name, note: clip(p.note), ...(score != null ? { score } : {}) };
    }),
    board: {
      categories: [...board.entries()].map(([category, n]) => ({ category, count: n })),
      asks: askRows.slice(-MAX_ASKS).map(({ ask, liveCount }) => toAsk(ask, liveCount)),
    },
    itinerary: slotRows.map((s) => {
      const slot = toSlot(s);
      return { ...slot, note: clip(slot.note) };
    }),
  };
  return fitContext(context);
}
