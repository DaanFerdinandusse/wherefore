// Dev only: builds a Lisbon trip for one signed-in user on the Neon branch in
// .env.local, from live recommendation results (real names and images): a
// dozen trip places across the categories, two of them the advisor's own with
// notes, two asks (one done, one still running), a few filled slots, the
// built_from box and the call log. Prints the trip URL.
//
//   npx tsx --conditions=react-server scripts/dev/dev-trip.ts            lists the auth users
//   npx tsx --conditions=react-server scripts/dev/dev-trip.ts <user id>  builds the trip
//   add --pending for an empty trip whose seed is pending (the skeleton and the kick-off)

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const FAVORITES = ["Via Carota", "Lilia", "Attaboy"];
const NEW_YORK = { lat: 40.73, lon: -73.99 };

async function main() {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const args = process.argv.slice(2);
  const ownerId = args.find((a) => !a.startsWith("--"));
  const pending = args.includes("--pending");

  if (!ownerId) {
    const users = await db.execute<{ id: string; email: string; name: string }>(
      sql`select id::text, email, name from neon_auth."user" order by "createdAt" desc limit 20`,
    );
    console.log(users.rows.length ? users.rows : "No users on this branch yet. Sign up in the app first.");
    return;
  }

  const qloo = await import("@/lib/qloo");
  const { upsertPlaces, saveAdvisorPlace } = await import("@/lib/places");
  const { createClient, addFavorite } = await import("@/lib/clients");
  const trips = await import("@/lib/trips");
  const scope = { ownerId, orgIds: [] as string[] };

  const lisbon = (await qloo.resolveLocality("Lisbon")).candidates.find((c) => c.countryCode === "PT");
  if (!lisbon) throw new Error("Lisbon did not resolve");
  const destination = {
    name: lisbon.name,
    disambiguation: lisbon.disambiguation,
    countryCode: lisbon.countryCode,
    lat: lisbon.lat,
    lon: lisbon.lon,
    radiusM: lisbon.radiusM,
    localityEntityId: lisbon.entityId,
  };

  const favorites: { entityId: string; name: string }[] = [];
  for (const query of FAVORITES) {
    const top = (await qloo.searchEntities(query, { types: "urn:entity:place", near: NEW_YORK, take: 1 })).candidates[0];
    if (top) favorites.push({ entityId: top.entityId, name: top.name });
  }
  const signals = favorites.map((f) => f.entityId);

  const client = await createClient({ name: "Ana Ruiz", homeCity: "New York", groundRules: ["Vegetarian options", "No early starts"] }, scope);
  for (const f of favorites) await addFavorite(client.id, { query: f.name, entityId: f.entityId, match: "resolved", candidates: [] }, scope);
  const created = await trips.createTrip(scope, {
    clientId: client.id,
    destination,
    startDate: "2027-05-14",
    endDate: "2027-05-17",
    datesMode: "exact",
    adults: 2,
    children: 0,
    travelers: [{ name: "Clara", role: "guest", drivesSearch: false }],
  });
  const tripId = created.trip.id;
  const ctx = { tripId };
  if (pending) {
    // An empty trip with its seed pending: the board shows the skeleton and kicks the seed off.
    console.log(`http://localhost:3000/trips/${tripId}`);
    return;
  }

  // The seed: one call per category, sequential.
  const picked: Awaited<ReturnType<typeof qloo.findPlaces>>["results"] = [];
  const calls: Awaited<ReturnType<typeof qloo.findPlaces>>["calls"] = [];
  const perCategory = { eat: 4, drink: 3, coffee: 2, see: 2, stay: 1 } as const;
  for (const [category, take] of Object.entries(perCategory) as [keyof typeof perCategory, number][]) {
    const tags = qloo.CATEGORY_FILTER_TAGS[category];
    const found = await qloo.findPlaces({ destination, signals, tags, take: take + 4 }, ctx);
    calls.push(...found.calls);
    const fresh = found.results.filter((r) => r.place.images.length > 0 && !picked.some((p) => p.place.entityId === r.place.entityId));
    picked.push(...fresh.slice(0, take).map((r) => ({ ...r, category })));
  }
  const placeIds = await upsertPlaces(picked.map((r) => r.place));

  const advisorRows: Record<string, string> = {};
  const notes = ["Ask for the counter. The vegetable plates are the reason to go.", "Book the terrace table before 8."];
  for (const [i, r] of picked.filter((p) => p.category === "eat" || p.category === "drink").slice(0, 2).entries()) {
    const saved = await saveAdvisorPlace(scope, { placeId: placeIds[r.place.entityId], city: "Lisbon", note: notes[i] });
    advisorRows[r.place.entityId] = saved.id;
  }

  const tripPlaceIds = await trips.upsertTripPlaces(
    tripId,
    picked.map((r, i) => ({
      placeId: placeIds[r.place.entityId],
      source: advisorRows[r.place.entityId] ? ("advisor" as const) : ("seed" as const),
      category: r.category,
      bestAffinity: r.affinity,
      bestScore: r.score,
      explainability: qloo.explainabilityFor(r, favorites),
      advisorPlaceId: advisorRows[r.place.entityId] ?? null,
      position: i,
    })),
    scope,
  );
  const tp = (r: (typeof picked)[number]) => tripPlaceIds[placeIds[r.place.entityId]];

  // Two asks: natural wine (done) and a late dinner (still running).
  const drinks = picked.filter((r) => r.category === "drink");
  const eats = picked.filter((r) => r.category === "eat");
  const wine = await trips.createAsk(tripId, { label: "Natural wine · Sat", toolCallId: `dev-${tripId}-wine`, status: "done" }, scope);
  await trips.addAskPlaces(wine.id, drinks.map((r, rank) => ({ tripPlaceId: tp(r), rank, score: r.score })), scope);
  await trips.updateAsk(wine.id, { elapsedMs: 1400, loosened: [] }, scope);
  const dinner = await trips.createAsk(tripId, { label: "Late dinner · Fri", toolCallId: `dev-${tripId}-dinner`, status: "running" }, scope);
  await trips.addAskPlaces(dinner.id, eats.slice(1, 3).map((r, rank) => ({ tripPlaceId: tp(r), rank, score: r.score })), scope);

  await trips.setSlots(
    tripId,
    [
      { day: 1, slot: "lunch", tripPlaceId: tp(eats[0]) },
      { day: 1, slot: "night", tripPlaceId: tp(drinks[0]), note: "Stand at the bar, the list changes nightly." },
      { day: 2, slot: "morning", tripPlaceId: tp(picked.find((r) => r.category === "coffee") ?? eats[1]) },
    ],
    "merge",
    scope,
  );

  for (const call of calls) {
    await trips.logTripCall(tripId, { endpoint: call.endpoint, params: call.params, count: call.count, ms: call.ms, source: "seed" }, scope);
  }
  await trips.updateTrip(
    tripId,
    {
      seedStatus: "done",
      builtFrom: {
        favorites: [{ clientName: "Ana Ruiz", names: favorites.map((f) => f.name) }],
        advisorPlaceCount: Object.keys(advisorRows).length,
        companionsWithoutFavorites: ["Clara"],
        rules: ["Vegetarian options", "No early starts"],
      },
    },
    scope,
  );

  console.log(`${picked.length} places, ${calls.length} calls`);
  console.log(`http://localhost:3000/trips/${tripId}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
