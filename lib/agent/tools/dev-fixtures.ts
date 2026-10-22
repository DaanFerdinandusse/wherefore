import "server-only";

import { and, count, eq, sql } from "drizzle-orm";

import { addFavorite, createClient, setTasteTags } from "@/lib/clients";
import { db } from "@/lib/db";
import { tripAsks, tripPlaces, trips } from "@/lib/db/schema";
import { DEMO_ADVISOR_PLACES, DEMO_CLIENTS } from "@/lib/demo/data";
import { nameMatches, pickLocality } from "@/lib/demo/rules";
import { saveAdvisorPlace, upsertPlaces } from "@/lib/places";
import { haversineM, resolveLocality, searchEntities, tastePortrait } from "@/lib/qloo";
import { createTrip } from "@/lib/trips";

// Development fixtures for e2e/chat/tools.spec.ts: a client with the demo
// favorites (Ana: Via Carota, Lilia, Attaboy, Devoción, resolved live near
// New York), three of the demo advisor places in Lisbon, and a fresh Lisbon
// trip with a guest without favorites. Every lookup lands in api_cache, so
// later runs are fast. Never used in production code paths.

const NEAR_KM = 50;
const ADVISOR_PLACES = ["Senhor Uva", "Black Sheep", "Prado"];

async function resolvePlace(name: string, near: { lat: number; lon: number }) {
  const { candidates } = await searchEntities(name, { types: "urn:entity:place", near, take: 5 });
  return candidates.find(
    (c) =>
      c.place &&
      nameMatches(name, c.name) &&
      (c.lat === undefined || c.lon === undefined || haversineM(c.lat, c.lon, near.lat, near.lon) <= NEAR_KM * 1000),
  );
}

export async function createDevSeedTrip(ownerId: string): Promise<{ tripId: string; chatId: string; clientId: string }> {
  const spec = DEMO_CLIENTS[0];
  if (!spec) throw new Error("No demo client");
  const home = pickLocality(spec.home, (await resolveLocality(spec.home.query)).candidates);
  if (!home) throw new Error(`No locality for ${spec.home.query}`);

  const client = await createClient(
    { name: spec.name, homeCity: spec.homeCity, homeLat: home.lat, homeLon: home.lon, notes: spec.notes, groundRules: spec.groundRules },
    ownerId,
  );
  const signals: string[] = [];
  for (const favorite of spec.favorites) {
    const hit = await resolvePlace(favorite.name, home);
    if (hit?.place) {
      const ids = await upsertPlaces([hit.place]);
      await addFavorite(
        client.id,
        { query: favorite.name, entityId: hit.entityId, placeId: ids[hit.entityId] ?? null, match: "resolved", candidates: [] },
        ownerId,
      );
      signals.push(hit.entityId);
    } else {
      await addFavorite(client.id, { query: favorite.name, match: "unmatched", candidates: [] }, ownerId);
    }
  }
  if (signals.length > 0) {
    const portrait = await tastePortrait(signals);
    await setTasteTags(client.id, portrait.tags, ownerId);
  }

  const lisbonSpec = DEMO_ADVISOR_PLACES[0];
  if (!lisbonSpec) throw new Error("No demo advisor places");
  const lisbon = pickLocality(lisbonSpec.locality, (await resolveLocality(lisbonSpec.locality.query)).candidates);
  if (!lisbon) throw new Error("No locality for Lisbon");
  for (const saved of lisbonSpec.places.filter((p) => ADVISOR_PLACES.includes(p.name))) {
    const hit = await resolvePlace(saved.name, lisbon);
    if (!hit?.place) continue;
    const ids = await upsertPlaces([hit.place]);
    const placeId = ids[hit.entityId];
    if (placeId) await saveAdvisorPlace(ownerId, { placeId, city: lisbon.name, note: saved.note });
  }

  const created = await createTrip(ownerId, {
    clientId: client.id,
    destination: {
      name: lisbon.name,
      disambiguation: lisbon.disambiguation,
      ...(lisbon.countryCode ? { countryCode: lisbon.countryCode } : {}),
      lat: lisbon.lat,
      lon: lisbon.lon,
      radiusM: lisbon.radiusM,
      localityEntityId: lisbon.entityId,
    },
    startDate: "2027-05-14",
    endDate: "2027-05-18",
    datesMode: "exact",
    adults: 2,
    children: 0,
    travelers: [
      { clientId: client.id, name: client.name, role: "client", drivesSearch: true },
      { name: "Clara", role: "guest", drivesSearch: false },
    ],
  });
  return { tripId: created.trip.id, chatId: created.chatId, clientId: client.id };
}

/** What the e2e spec asserts on: seed status, places per category, asks with their places. */
export async function devTripState(ownerId: string, tripId: string) {
  const [trip] = await db
    .select({ seedStatus: trips.seedStatus, builtFrom: trips.builtFrom })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.ownerId, ownerId)))
    .limit(1);
  if (!trip) return null;
  const [categories, asks, reasons] = await Promise.all([
    db
      .select({ category: tripPlaces.category, source: tripPlaces.source, n: count() })
      .from(tripPlaces)
      .where(eq(tripPlaces.tripId, tripId))
      .groupBy(tripPlaces.category, tripPlaces.source),
    db
      .select({
        id: tripAsks.id,
        label: tripAsks.label,
        status: tripAsks.status,
        resultCount: tripAsks.resultCount,
        elapsedMs: tripAsks.elapsedMs,
        // Qualified by hand: a single-table select prints its columns bare.
        places: sql<number>`(select count(*)::int from ask_places ap where ap.ask_id = "trip_asks"."id")`,
      })
      .from(tripAsks)
      .where(eq(tripAsks.tripId, tripId)),
    db
      .select({ n: count() })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.tripId, tripId), sql`${tripPlaces.reason} is not null`)),
  ]);
  return { ...trip, categories, asks, reasons: reasons[0]?.n ?? 0 };
}
