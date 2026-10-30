import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { ensureAdvisor, getAdvisor, updateAdvisor } from "@/lib/auth/advisor";
import {
  addFavorite,
  createClient,
  listFavorites,
  setGroundRules,
  setMediaFavorites,
  setTasteTags,
  updateClientFields,
  type Client,
} from "@/lib/clients";
import type { BuiltFrom, Destination, TasteTag } from "@/lib/contracts";
import {
  DEMO_ADVISOR,
  DEMO_ADVISOR_PLACES,
  DEMO_CLIENTS,
  DEMO_TRIPS,
  type ClientSpec,
  type DemoSlot,
  type TripSpec,
} from "@/lib/demo/data";
import { addDays, nameTokens, tripDates } from "@/lib/demo/rules";
import { db } from "@/lib/db";
import { clients, trips } from "@/lib/db/schema";
import { findCoverPhoto, markCoverPhotoUsed } from "@/lib/unsplash";
import { getAdvisorPlaceForPlace, saveAdvisorPlace, upsertPlaces } from "@/lib/places";
import {
  CATEGORY_FILTER_TAGS,
  categoryOf,
  displayScore,
  explainabilityFor,
  findPlaces,
  scoreEntities,
  sharedTagsFor,
  tastePortrait,
  type PlaceResult,
  type QlooCall,
} from "@/lib/qloo";
import {
  computeStage,
  createTrip,
  logTripCall,
  setShareToken,
  setSlots,
  todayIso,
  updateTrip,
  upsertTripPlaces,
  type SlotInput,
  type Trip,
  type TripPlaceUpsert,
} from "@/lib/trips";

import { createResolver, toDestination, type Resolver } from "./resolve";

// The demo seed itself. Every step looks for its row first (clients by name,
// favorites by query, saved places by place id, trips by title) and writes
// only what is missing, so a second run adds nothing.

export type SeedOwner = { id: string; email: string };
type Log = (line: string) => void;

export type SeedReport = {
  unmatchedFavorites: { client: string; query: string; candidates: string[] }[];
  missingAdvisorPlaces: { city: string; name: string }[];
  trips: {
    title: string;
    stage: string;
    dates: string;
    places: number;
    slots: number;
    seedStatus: string;
    shareToken: string | null;
  }[];
  calls: { calls: number; cached: number };
};

/** One of the advisor's saved places, as the trips need it. */
type SavedPlace = { name: string; city: string; advisorPlaceId: string; placeId: string; entityId: string };

type ClientState = { client: Client; favorites: { entityId: string; name: string }[] };

const sameQuery = (a: string, b: string) => nameTokens(a).join(" ") === nameTokens(b).join(" ");

export async function seedDemo(owner: SeedOwner, log: Log): Promise<SeedReport> {
  const resolver = createResolver();
  const report: SeedReport = { unmatchedFavorites: [], missingAdvisorPlaces: [], trips: [], calls: resolver.stats };

  // 1. The advisors row, as ensureAdvisor writes it on the first request.
  const advisor = await ensureAdvisor({ userId: owner.id, email: owner.email, name: DEMO_ADVISOR.displayName });
  if (advisor.displayName !== DEMO_ADVISOR.displayName || advisor.homeCity !== DEMO_ADVISOR.homeCity) {
    await updateAdvisor(owner.id, { displayName: DEMO_ADVISOR.displayName, homeCity: DEMO_ADVISOR.homeCity });
  }
  log(`Advisor ${DEMO_ADVISOR.displayName}, ${DEMO_ADVISOR.homeCity}`);

  // 2. Clients, their favorites, media and taste tags.
  const byName = new Map<string, ClientState>();
  for (const spec of DEMO_CLIENTS) {
    const state = await seedClient(spec, owner.id, resolver, report, log);
    byName.set(spec.name, state);
  }

  // 3. My places, per city, with the city string the destination picker stores.
  const saved: SavedPlace[] = [];
  for (const city of DEMO_ADVISOR_PLACES) {
    const locality = await resolver.locality(city.locality);
    let added = 0;
    let kept = 0;
    for (const spec of city.places) {
      const found = await resolver.place(spec, locality);
      if (found.match !== "resolved") {
        report.missingAdvisorPlaces.push({ city: locality.name, name: spec.name });
        log(`  ! ${spec.name} not found near ${locality.name}`);
        continue;
      }
      const placeIds = await upsertPlaces([found.place]);
      const placeId = placeIds[found.entityId];
      if (!placeId) throw new Error(`upsertPlaces returned no id for ${found.name}`);
      let row = await getAdvisorPlaceForPlace(owner.id, placeId);
      if (!row) {
        row = await saveAdvisorPlace(owner.id, { placeId, city: locality.name, note: spec.note });
        added += 1;
      }
      kept += 1;
      saved.push({ name: spec.name, city: row.city, advisorPlaceId: row.id, placeId, entityId: found.entityId });
    }
    log(`My places in ${locality.name}: ${kept} saved, ${added} new`);
  }

  // The advisor's own taste portrait, from their places ("Your taste").
  const current = await getAdvisor(owner.id);
  if (current && current.tasteTags.length === 0 && saved.length > 0) {
    const portrait = await tastePortrait(saved.map((s) => s.entityId));
    resolver.track(portrait.calls);
    await updateAdvisor(owner.id, { tasteTags: portrait.tags });
    log(`Your taste: ${portrait.tags.slice(0, 5).map((t) => t.name).join(", ")}`);
  }

  // 4. Trips, one per stage.
  const today = todayIso();
  for (const spec of DEMO_TRIPS) {
    const state = byName.get(spec.client);
    if (!state) throw new Error(`Trip "${spec.title}" names an unknown client ${spec.client}.`);
    const trip = await seedTrip(spec, state, saved, owner.id, resolver, today, log);
    report.trips.push(trip);
  }
  return report;
}

async function seedClient(
  spec: ClientSpec,
  ownerId: string,
  resolver: Resolver,
  report: SeedReport,
  log: Log,
): Promise<ClientState> {
  const home = await resolver.locality(spec.home);
  const [existing] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.ownerId, ownerId), eq(clients.name, spec.name)))
    .limit(1);

  let client: Client;
  if (!existing) {
    client = await createClient(
      {
        name: spec.name,
        homeCity: spec.homeCity,
        homeLat: home.lat,
        homeLon: home.lon,
        notes: spec.notes,
        status: spec.status,
        groundRules: spec.groundRules,
      },
      ownerId,
    );
  } else {
    client = existing;
    if (!client.homeCity || client.homeLat === null || client.homeLon === null) {
      client = await updateClientFields(
        client.id,
        { homeCity: client.homeCity ?? spec.homeCity, homeLat: home.lat, homeLon: home.lon },
        ownerId,
      );
    }
    if (client.groundRules.length === 0 && spec.groundRules.length > 0) {
      client = await setGroundRules(client.id, spec.groundRules, ownerId);
    }
  }

  // Favorites: add the ones whose query is not there yet, in order.
  const stored = await listFavorites(client.id, ownerId);
  let addedFavorites = 0;
  for (const favorite of spec.favorites) {
    if (stored.some((f) => sameQuery(f.query, favorite.name))) continue;
    const found = await resolver.place(favorite, home);
    if (found.match === "resolved") {
      const placeIds = await upsertPlaces([found.place]);
      await addFavorite(
        client.id,
        { query: favorite.name, entityId: found.entityId, placeId: placeIds[found.entityId] ?? null, match: "resolved", candidates: [] },
        ownerId,
      );
    } else {
      await addFavorite(client.id, { query: favorite.name, match: "unmatched", candidates: found.candidates }, ownerId);
    }
    addedFavorites += 1;
  }

  // "Also into": artists, films and books.
  const media = [...client.mediaFavorites];
  for (const item of spec.media) {
    if (media.some((m) => m.kind === item.kind && sameQuery(m.query, item.query))) continue;
    media.push(await resolver.media(item.query, item.kind));
  }
  if (media.length !== client.mediaFavorites.length) client = await setMediaFavorites(client.id, media, ownerId);

  const favorites = await listFavorites(client.id, ownerId);
  for (const f of favorites) {
    if (f.match === "unmatched") {
      report.unmatchedFavorites.push({ client: client.name, query: f.query, candidates: f.candidates.map((c) => c.name) });
    }
  }
  const signals = favorites
    .filter((f) => f.match === "resolved" && f.entityId)
    .map((f) => ({ entityId: f.entityId as string, name: f.place?.name ?? f.query }));

  // Taste tags from the resolved favorites, when new or never computed.
  if (signals.length > 0 && (addedFavorites > 0 || client.tasteTags.length === 0)) {
    const portrait = await tastePortrait(signals.map((s) => s.entityId));
    resolver.track(portrait.calls);
    client = await setTasteTags(client.id, portrait.tags, ownerId);
  }

  const status = existing ? "kept" : "new";
  log(
    `Client ${client.name} (${status}): ${signals.length} of ${favorites.length} favorites resolved, ${addedFavorites} added; taste ${client.tasteTags
      .slice(0, 4)
      .map((t) => t.name)
      .join(", ")}`,
  );
  return { client, favorites: signals };
}

async function seedTrip(
  spec: TripSpec,
  state: ClientState,
  saved: SavedPlace[],
  ownerId: string,
  resolver: Resolver,
  today: string,
  log: Log,
): Promise<SeedReport["trips"][number]> {
  const { client } = state;
  const locality = await resolver.locality(spec.destination);
  const destination = toDestination(locality);
  const dates = tripDates(spec.dates, today);

  const [existing] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.ownerId, ownerId), eq(trips.title, spec.title)))
    .limit(1);

  let trip: Trip;
  if (existing) {
    trip = existing;
  } else {
    const photo = await findCoverPhoto(destination.name);
    if (photo) await markCoverPhotoUsed(photo.downloadLocation);
    const created = await createTrip(ownerId, {
      clientId: client.id,
      destination,
      cover: photo?.cover ?? null,
      startDate: dates.start,
      endDate: dates.end,
      datesMode: "exact",
      adults: spec.adults,
      children: spec.children,
      title: spec.title,
      travelers: [
        { clientId: client.id, name: client.name, role: "client", drivesSearch: true },
        ...spec.guests.map((name) => ({ name, role: "guest" as const, drivesSearch: false })),
      ],
    });
    trip = created.trip;
  }
  if (spec.share) trip = await setShareToken(trip.id, ownerId);

  let placeCount = 0;
  let slotCount = 0;
  if (spec.populate && trip.seedStatus !== "done") {
    try {
      const filled = await populateTrip(trip, spec, state, destination, saved, ownerId, resolver);
      placeCount = filled.places;
      slotCount = filled.slots;
      trip = filled.trip;
    } catch (error) {
      await updateTrip(trip.id, { seedStatus: "failed" }, ownerId);
      throw error;
    }
  }

  const stage = computeStage(trip, today);
  const board = spec.populate
    ? placeCount > 0
      ? `, ${placeCount} places and ${slotCount} slots written`
      : ", board already filled"
    : "";
  log(`Trip ${trip.title} (${existing ? "kept" : "new"}): ${stage}, ${trip.startDate} to ${trip.endDate}${board}, seed ${trip.seedStatus}`);
  const [counts] = await db
    .select({
      places: sql<number>`(select count(*)::int from trip_places where trip_id = ${trip.id})`,
      slots: sql<number>`(select count(*)::int from itinerary_slots where trip_id = ${trip.id})`,
    })
    .from(trips)
    .where(eq(trips.id, trip.id));
  return {
    title: trip.title,
    stage,
    dates: `${trip.startDate} to ${trip.endDate}`,
    places: counts?.places ?? 0,
    slots: counts?.slots ?? 0,
    seedStatus: trip.seedStatus,
    shareToken: trip.shareToken,
  };
}

/**
 * What the agent's seed turn would write, limited to eat and drink: two
 * findPlaces calls with the client's favorites as signals, the advisor's
 * places in the city scored on the same signals ("Your place"), and a few
 * slots on days 1 and 2. Every call is logged for "How we got this".
 */
async function populateTrip(
  trip: Trip,
  spec: TripSpec,
  state: ClientState,
  destination: Destination,
  saved: SavedPlace[],
  ownerId: string,
  resolver: Resolver,
): Promise<{ trip: Trip; places: number; slots: number }> {
  const populate = spec.populate;
  if (!populate) return { trip, places: 0, slots: 0 };
  const { client, favorites } = state;
  const signals = favorites.map((f) => f.entityId);
  const tasteTags: TasteTag[] = client.tasteTags;
  const logCalls = async (calls: QlooCall[], loosened: string[] = []) => {
    resolver.track(calls);
    for (const call of calls) {
      await logTripCall(
        trip.id,
        { endpoint: call.endpoint, params: call.params, count: call.count, ms: call.ms, loosened, source: "seed" },
        ownerId,
      );
    }
  };

  const results: Record<"eat" | "drink", PlaceResult[]> = { eat: [], drink: [] };
  for (const category of ["eat", "drink"] as const) {
    const found = await findPlaces(
      {
        destination,
        signals,
        tags: CATEGORY_FILTER_TAGS[category],
        tagsOperator: "union",
        excludeIds: signals,
        take: populate.take,
      },
      { tripId: trip.id },
    );
    await logCalls(found.calls, found.loosened);
    results[category] = found.results.slice(0, populate.take);
  }
  const all = [...results.eat, ...results.drink];
  const placeIds = await upsertPlaces(all.map((r) => r.place));
  const cityPlaces = saved.filter((s) => s.city.toLowerCase() === destination.name.toLowerCase());
  const advisorByPlace = new Map(cityPlaces.map((s) => [s.placeId, s]));

  const rows: TripPlaceUpsert[] = [];
  for (const r of all) {
    const placeId = placeIds[r.place.entityId];
    if (!placeId) continue;
    rows.push({
      placeId,
      source: "seed",
      category: r.category,
      bestAffinity: r.affinity,
      bestScore: r.score,
      explainability: explainabilityFor(r, favorites),
      sharedTags: sharedTagsFor(r.place, tasteTags),
      advisorPlaceId: advisorByPlace.get(placeId)?.advisorPlaceId ?? null,
      position: rows.length,
    });
  }

  // The advisor's places in this city, scored on the client's signals. A weak
  // match stays, with a score below the seed set.
  if (cityPlaces.length > 0 && signals.length > 0) {
    const scored = await scoreEntities({
      signals,
      entityIds: cityPlaces.map((s) => s.entityId),
      destination,
      favorites,
    });
    await logCalls(scored.calls);
    const setAffinities = all.flatMap((r) => r.affinity ?? []);
    for (const s of scored.scores) {
      const mine = cityPlaces.find((c) => c.entityId === s.entityId);
      if (!mine) continue;
      rows.push({
        placeId: mine.placeId,
        source: "advisor",
        category: categoryOf(s.place),
        bestAffinity: s.affinity,
        bestScore: displayScore(s.affinity, setAffinities),
        explainability: s.explainability,
        sharedTags: sharedTagsFor(s.place, tasteTags),
        advisorPlaceId: mine.advisorPlaceId,
        position: rows.length,
      });
    }
  }
  const tripPlaceIds = await upsertTripPlaces(trip.id, rows, ownerId);

  // A few slots on days 1 and 2.
  const used = new Set<string>();
  const pickTripPlace = (slot: DemoSlot): string | undefined => {
    let placeId: string | undefined;
    if ("advisorPlace" in slot.pick) {
      const name = slot.pick.advisorPlace;
      placeId = cityPlaces.find((c) => c.name === name)?.placeId;
    } else {
      const { category, index } = slot.pick;
      // Results the re-check put in this category first, then the rest of that search.
      const ordered = [
        ...results[category].filter((r) => r.category === category),
        ...results[category].filter((r) => r.category !== category),
      ]
        .map((r) => placeIds[r.place.entityId])
        .filter((id): id is string => !!id);
      const wanted = ordered[index];
      placeId = wanted && !used.has(wanted) ? wanted : ordered.find((id) => !used.has(id));
    }
    const tripPlaceId = placeId ? tripPlaceIds[placeId] : undefined;
    if (!placeId || !tripPlaceId || used.has(placeId)) return undefined;
    used.add(placeId);
    return tripPlaceId;
  };
  const slots: SlotInput[] = [];
  for (const slot of populate.slots) {
    const tripPlaceId = pickTripPlace(slot);
    if (!tripPlaceId) continue;
    slots.push({
      day: slot.day,
      date: trip.startDate ? addDays(trip.startDate, slot.day - 1) : null,
      slot: slot.slot,
      tripPlaceId,
      note: slot.note ?? "",
    });
  }
  const written = await setSlots(trip.id, slots, "merge", ownerId);

  const builtFrom: BuiltFrom = {
    favorites: [{ clientName: client.name, names: favorites.map((f) => f.name) }],
    advisorPlaceCount: cityPlaces.length,
    companionsWithoutFavorites: spec.guests,
    rules: client.groundRules,
  };
  const updated = await updateTrip(trip.id, { seedStatus: "done", builtFrom }, ownerId);
  return { trip: updated, places: Object.keys(tripPlaceIds).length, slots: written.applied.length };
}
