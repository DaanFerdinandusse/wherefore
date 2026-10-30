import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MAX_EXCLUDED } from "@/lib/agent/tools/signals";
import { addFavorite, createClient, setMediaFavorites } from "@/lib/clients";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { askPlaces, tripCalls, tripPlaces } from "@/lib/db/schema";
import { upsertPlaces } from "@/lib/places";
import insightsFixture from "@/lib/qloo/__fixtures__/insights-place.json";
import { memoryCacheStore } from "@/lib/qloo/cache";
import { createQlooClient } from "@/lib/qloo/client";
import type { PlaceResult } from "@/lib/qloo/contracts";
import { addAskPlaces, createAsk, createTrip, listTripPlaceCards, setSlots, upsertTripPlaces } from "@/lib/trips";
import { signalSetHash } from "@/lib/trips/evidence";
import { pickReplacement, replaceTripPlace, replacementQuery, replacementScore } from "@/lib/trips/replace";

const template = insightsFixture.results.entities[0]!;
function rawPlace(entityId: string, name: string, affinity: number, favorites: [string, string]) {
  return {
    ...template,
    entity_id: entityId,
    name,
    query: {
      ...template.query,
      affinity,
      explainability: {
        "signal.interests.entities": [
          { entity_id: favorites[0], score: 0.6 },
          { entity_id: favorites[1], score: 0.4 },
        ],
      },
    },
  };
}

/** A recommendation client whose upstream answers every insights call with `entities`. */
function fakeClient(entities: unknown[]) {
  const urls: URL[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    urls.push(new URL(String(input)));
    return new Response(JSON.stringify({ success: true, results: { entities } }), { status: 200 });
  });
  const client = createQlooClient({
    apiKey: "k",
    baseUrl: "https://api.example.test",
    fetch,
    store: memoryCacheStore(),
    sleep: async () => {},
  });
  return { client, urls };
}

const result = (entityId: string, primaryType: string | null): PlaceResult =>
  ({
    place: { entityId, primaryType, types: [] },
    category: "eat",
    affinity: 0.8,
    score: 90,
    signalScores: [],
    distanceM: null,
  }) as unknown as PlaceResult;

describe("replacementQuery", () => {
  const filters = { popularityMax: 0.6, michelin: true, openDay: "monday" } as const;

  it("keeps the ask's less known, Michelin and open day filters", () => {
    const q = replacementQuery({
      category: "eat",
      placeTypes: [],
      asks: [{ askId: "a", rank: 1, query: { tags: ["urn:tag:x"], ...filters } }],
    });
    expect(q).toMatchObject(filters);
  });

  it("keeps them when the ask stored no tags and the category answers instead", () => {
    const q = replacementQuery({
      category: "eat",
      placeTypes: [],
      asks: [{ askId: "a", rank: 1, query: { intent: "dinner", ...filters } }],
    });
    expect(q).toMatchObject({ ...filters, askId: "a" });
    expect(q.tags.length).toBeGreaterThan(0);
  });

  it("reruns the ids the search used and its price cap when the advisor passed no tags", () => {
    const q = replacementQuery({
      category: "drink",
      placeTypes: [],
      asks: [{ askId: "a", rank: 2, query: { intent: "natural wine bars", resolvedTags: ["urn:tag:wine:natural"], priceMax: 2 } }],
    });
    expect(q).toEqual({ tags: ["urn:tag:wine:natural"], priceMax: 2, askId: "a", rank: 2 });
  });

  it("never sends the advisor's own words as tag ids", () => {
    const q = replacementQuery({
      category: "eat",
      placeTypes: [],
      asks: [{ askId: "a", rank: 1, query: { tags: ["seafood"], resolvedTags: ["urn:tag:seafood"] } }],
    });
    expect(q.tags).toEqual(["urn:tag:seafood"]);
    const words = replacementQuery({ category: "eat", placeTypes: [], asks: [{ askId: "a", rank: 1, query: { tags: ["seafood"] } }] });
    expect(words.tags).toEqual(["urn:tag:category:place:restaurant"]);
  });

  it("keeps the price cap and the area when the category answers instead of the ask's tags", () => {
    const area = { lat: 38.71, lon: -9.13, radiusM: 1_500 };
    const q = replacementQuery({
      category: "eat",
      placeTypes: [],
      asks: [{ askId: "a", rank: 1, query: { intent: "dinner", priceMax: 2, resolvedTags: [], resolvedArea: area } }],
    });
    expect(q).toEqual({ tags: ["urn:tag:category:place:restaurant"], priceMax: 2, area, askId: "a", rank: 1 });
  });

  it("asks the ask again when the removed place came from one with tags", () => {
    const q = replacementQuery({
      category: "drink",
      placeTypes: [],
      asks: [{ askId: "ask-1", rank: 3, query: { tags: ["urn:tag:category:place:wine_bar"], priceMax: 2 } }],
    });
    expect(q).toEqual({ tags: ["urn:tag:category:place:wine_bar"], priceMax: 2, askId: "ask-1", rank: 3 });
  });

  it("falls back to the board category, then to the place's own category tag", () => {
    expect(replacementQuery({ category: "coffee", placeTypes: [], asks: [] }).tags).toEqual([
      "urn:tag:category:place:cafe",
      "urn:tag:category:place:coffee_shop",
    ]);
    expect(
      replacementQuery({ category: "other", placeTypes: ["urn:tag:category:place:bookstore", "x"], asks: [] }).tags,
    ).toEqual(["urn:tag:category:place:bookstore"]);
  });
});

describe("pickReplacement", () => {
  it("skips anything already on the trip, even when the upstream returned it", () => {
    const picked = pickReplacement(
      [result("on-trip", "urn:tag:genre:place:restaurant"), result("new", "urn:tag:genre:place:restaurant")],
      ["on-trip"],
      "eat",
    );
    expect(picked?.place.entityId).toBe("new");
  });

  it("prefers the removed place's category, else the best remaining", () => {
    const bar = result("bar", "urn:tag:genre:place:restaurant:cocktail_bar");
    const restaurant = result("restaurant", "urn:tag:genre:place:restaurant");
    expect(pickReplacement([bar, restaurant], [], "eat")?.place.entityId).toBe("restaurant");
    expect(pickReplacement([bar], [], "eat")?.place.entityId).toBe("bar");
    expect(pickReplacement([bar], ["bar"], "eat")).toBeNull();
  });
});

describe("replacementScore", () => {
  const best = { affinity: 0.9, score: 80 };
  const row = (affinity: number | null, signalHash: string | null, onBoard = true) => ({ affinity, signalHash, onBoard });

  it("ranks only against rows of the same signal set that are still on the board", () => {
    const board = [row(0.95, "now"), row(0.85, "now"), row(0.99, "before"), row(0.99, "now", false)];
    // In the middle of 0.95, 0.90 and 0.85, not on top of the old affinities.
    expect(replacementScore(best, board, "now")).toBe(77);
  });

  it("keeps the search's own score when no row compares", () => {
    // Every itinerary change moves the hash: picks lift the affinities, so the old rows say nothing.
    expect(replacementScore(best, [row(0.8, "before"), row(0.8, "before")], "now")).toBe(80);
    expect(replacementScore(best, [], "now")).toBe(80);
  });
});

describe.skipIf(!hasDatabase)("replaceTripPlace", () => {
  const run = testRun();
  const entity = (key: string) => `${run.entityPrefix}${key}`;
  let tripId = "";
  let removedId = "";
  let keptEntity = "";
  let askId = "";
  let clientId = "";
  const FAV_A = entity("fav-a");
  const FAV_B = entity("fav-b");
  const favs: [string, string] = [FAV_A, FAV_B];

  beforeAll(async () => {
    const client = await createClient({ name: "Ana Ruiz", homeCity: "New York" }, run.owner);
    clientId = client.id;
    const favorites = await upsertPlaces([
      { entityId: FAV_A, name: "Via Carota" },
      { entityId: FAV_B, name: "Lilia" },
    ]);
    await addFavorite(client.id, { query: "via carota", entityId: FAV_A, placeId: favorites[FAV_A], match: "resolved", candidates: [] }, run.owner);
    await addFavorite(client.id, { query: "lilia", entityId: FAV_B, placeId: favorites[FAV_B], match: "resolved", candidates: [] }, run.owner);

    const { trip } = await createTrip(run.owner, {
      clientId: client.id,
      destination: LISBON,
      startDate: "2026-05-14",
      endDate: "2026-05-16",
      datesMode: "exact",
      adults: 1,
      children: 0,
      travelers: [],
    });
    tripId = trip.id;
    keptEntity = entity("kept");
    const placeIds = await upsertPlaces([
      { entityId: entity("removed"), name: "Removed place", primaryType: "urn:tag:genre:place:restaurant" },
      { entityId: keptEntity, name: "Kept place", primaryType: "urn:tag:genre:place:restaurant" },
    ]);
    const written = await upsertTripPlaces(
      tripId,
      [
        { placeId: placeIds[entity("removed")]!, source: "seed", category: "eat", bestAffinity: 0.81, bestScore: 94 },
        { placeId: placeIds[keptEntity]!, source: "seed", category: "eat", bestAffinity: 0.79, bestScore: 60 },
      ],
      run.owner,
    );
    removedId = written[placeIds[entity("removed")]!]!;
    const ask = await createAsk(tripId, { label: "Long lunch", query: { tags: ["urn:tag:category:place:restaurant"] } }, run.owner);
    askId = ask.id;
    await addAskPlaces(askId, [{ tripPlaceId: removedId, rank: 1, score: 94 }], run.owner);
  });

  afterAll(() => cleanup(run));

  it("excludes every trip entity, skips a returned duplicate and writes the next best place", async () => {
    const { client, urls } = fakeClient([
      // The upstream ignoring the exclusion: a place already on the trip comes back first.
      rawPlace(keptEntity, "Kept place", 0.83, favs),
      rawPlace(entity("new-1"), "New place", 0.8, favs),
      rawPlace(entity("new-2"), "Another place", 0.78, favs),
    ]);

    const card = await replaceTripPlace(tripId, removedId, run.owner, { client });

    const params = urls[0]!.searchParams;
    expect(params.get("filter.exclude.entities")?.split(",").sort()).toEqual([entity("kept"), entity("removed")].sort());
    expect(params.get("signal.interests.entities")).toBe(`${FAV_A},${FAV_B}`);
    expect(params.get("filter.tags")).toBe("urn:tag:category:place:restaurant");

    expect(card).toMatchObject({ name: "New place", source: "manual", status: "suggested", category: "eat" });
    expect(card?.because).toEqual([
      { entityId: FAV_A, name: "Via Carota", share: 60 },
      { entityId: FAV_B, name: "Lilia", share: 40 },
    ]);
    // Scored against what is left on the board (0.79): the removed place no longer counts.
    expect(card?.score).toBe(94);
    expect(card?.askIds).toEqual([askId]);

    const [removed] = await db.select().from(tripPlaces).where(eq(tripPlaces.id, removedId));
    expect(removed?.status).toBe("removed");
    const members = await db.select().from(askPlaces).where(eq(askPlaces.askId, askId));
    expect(members).toHaveLength(2);
    const calls = await db.select().from(tripCalls).where(eq(tripCalls.tripId, tripId));
    // Three results are fewer than five, so the tags were dropped for a second call: both are logged.
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ endpoint: "/v2/insights", source: `ask:${askId}`, count: 3, loosened: ["tags"] });
    expect(urls[1]!.searchParams.get("filter.exclude.entities")).toBe(params.get("filter.exclude.entities"));
  });

  it("reruns the ask's less known, Michelin and open day filters, and says what it had to loosen", async () => {
    const placeIds = await upsertPlaces([
      { entityId: entity("filtered"), name: "Filtered place", primaryType: "urn:tag:genre:place:restaurant" },
    ]);
    const placeId = placeIds[entity("filtered")]!;
    const written = await upsertTripPlaces(
      tripId,
      [{ placeId, source: "ask", category: "eat", bestAffinity: 0.7, bestScore: 50 }],
      run.owner,
    );
    const filteredId = written[placeId]!;
    const ask = await createAsk(
      tripId,
      {
        label: "Dinner",
        query: { tags: ["urn:tag:category:place:restaurant"], popularityMax: 0.6, michelin: true, openDay: "tuesday" },
      },
      run.owner,
    );
    await addAskPlaces(ask.id, [{ tripPlaceId: filteredId, rank: 1, score: 50 }], run.owner);

    const raw = {
      ...rawPlace(entity("hidden-gem"), "Hidden gem", 0.8, favs),
      popularity: 0.02,
      external: { michelin: [{ id: "530293", stars: null }] },
    };
    const { client, urls } = fakeClient([raw]);
    const notes: string[] = [];
    const card = await replaceTripPlace(tripId, filteredId, run.owner, { client, onNote: (note) => notes.push(note) });

    const params = urls[0]!.searchParams;
    expect(params.get("filter.popularity.max")).toBe("0.6");
    expect(params.get("filter.external.exists")).toBe("michelin");
    expect(params.get("filter.hours")).toBe("tuesday");
    // One place back from the first step, so the search tried to drop every
    // filter, the open day last. That one place needed none of it.
    expect(urls.at(-1)!.searchParams.has("filter.hours")).toBe(false);
    expect(notes).toEqual([]);
    // The facts reach the card from places.properties.
    expect(card).toMatchObject({ name: "Hidden gem", popularity: 0.02, michelin: true });
  });

  it("says what the place it brought back needed", async () => {
    const placeIds = await upsertPlaces([
      { entityId: entity("needs-filter"), name: "Needs filter", primaryType: "urn:tag:genre:place:restaurant" },
    ]);
    const placeId = placeIds[entity("needs-filter")]!;
    const written = await upsertTripPlaces(tripId, [{ placeId, source: "ask", category: "eat", bestAffinity: 0.7, bestScore: 50 }], run.owner);
    const ask = await createAsk(tripId, { label: "Lunch", query: { openDay: "tuesday" } }, run.owner);
    await addAskPlaces(ask.id, [{ tripPlaceId: written[placeId]!, rank: 1, score: 50 }], run.owner);
    const client = createQlooClient({
      apiKey: "k",
      baseUrl: "https://api.example.test",
      fetch: vi.fn<typeof globalThis.fetch>(async (input) => {
        const open = new URL(String(input)).searchParams.has("filter.hours");
        const entities = open ? [] : [rawPlace(entity("no-hours-known"), "Check its hours", 0.8, favs)];
        return new Response(JSON.stringify({ success: true, results: { entities } }), { status: 200 });
      }),
      store: memoryCacheStore(),
      sleep: async () => {},
    });
    const notes: string[] = [];
    const card = await replaceTripPlace(tripId, written[placeId]!, run.owner, { client, onNote: (note) => notes.push(note) });
    expect(card?.name).toBe("Check its hours");
    expect(notes).toEqual(["Too few places are listed as open on Tuesday, so check the hours of this one."]);
  });

  it("keeps the removal and says so when the search fails", async () => {
    const placeIds = await upsertPlaces([
      { entityId: entity("search-fails"), name: "Search fails", primaryType: "urn:tag:genre:place:restaurant" },
    ]);
    const placeId = placeIds[entity("search-fails")]!;
    const written = await upsertTripPlaces(tripId, [{ placeId, source: "ask", category: "eat", bestAffinity: 0.7, bestScore: 50 }], run.owner);
    const notes: string[] = [];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const card = await replaceTripPlace(tripId, written[placeId]!, run.owner, {
      findPlaces: async () => {
        throw new Error("414");
      },
      onNote: (note) => notes.push(note),
    });
    error.mockRestore();
    expect(card).toBeNull();
    expect(notes).toEqual(["The search for a replacement did not answer, so ask for one in the chat."]);
    const [row] = await db.select().from(tripPlaces).where(eq(tripPlaces.id, written[placeId]!));
    expect(row?.status).toBe("removed");
  });

  it("caps the exclusions for the request, the removed place included, and still checks the whole trip", async () => {
    const extra = Array.from({ length: MAX_EXCLUDED + 5 }, (_, i) => ({ entityId: entity(`many-${i}`), name: `Many ${i}` }));
    const placeIds = await upsertPlaces([
      ...extra,
      { entityId: entity("capped-off"), name: "Capped off", primaryType: "urn:tag:genre:place:restaurant" },
    ]);
    const written = await upsertTripPlaces(
      tripId,
      [...extra, { entityId: entity("capped-off") }].map((p) => ({ placeId: placeIds[p.entityId]!, source: "ask" as const, category: "eat" as const })),
      run.owner,
    );
    const removedPlaceId = written[placeIds[entity("capped-off")]!]!;
    const { client, urls } = fakeClient([
      rawPlace(entity("many-0"), "Many 0", 0.85, favs),
      rawPlace(entity("past-the-cap"), "Past the cap", 0.8, favs),
    ]);
    const card = await replaceTripPlace(tripId, removedPlaceId, run.owner, { client });
    const sent = urls[0]!.searchParams.get("filter.exclude.entities")!.split(",");
    expect(sent).toHaveLength(MAX_EXCLUDED);
    expect(sent).toContain(entity("capped-off"));
    // A place on the trip past the cap can come back from the search: it is never the pick.
    expect(card?.name).toBe("Past the cap");
  });

  it("returns null when nothing new comes back, and the removal stands", async () => {
    const { client } = fakeClient([rawPlace(keptEntity, "Kept place", 0.83, favs)]);
    const [kept] = await db
      .select({ id: tripPlaces.id })
      .from(tripPlaces)
      .where(and(eq(tripPlaces.tripId, tripId), eq(tripPlaces.source, "manual")));
    expect(kept).toBeDefined();
    const card = await replaceTripPlace(tripId, kept!.id, run.owner, { client });
    expect(card).toBeNull();
    const [row] = await db.select().from(tripPlaces).where(eq(tripPlaces.id, kept!.id));
    expect(row?.status).toBe("removed");
  });

  it("refuses a trip place of another owner", async () => {
    const { client } = fakeClient([]);
    await expect(replaceTripPlace(tripId, removedId, run.otherOwner, { client })).rejects.toThrow("No trip with that id.");
  });

  it("returns the same replacement for a repeat with the same key, and never adds a second one", async () => {
    const placeIds = await upsertPlaces([
      { entityId: entity("again"), name: "Again place", primaryType: "urn:tag:genre:place:restaurant" },
    ]);
    const againPlaceId = placeIds[entity("again")]!;
    const written = await upsertTripPlaces(
      tripId,
      [{ placeId: againPlaceId, source: "seed", category: "eat", bestAffinity: 0.7, bestScore: 50 }],
      run.owner,
    );
    const againId = written[againPlaceId]!;

    const first = fakeClient([rawPlace(entity("first-pick"), "First pick", 0.8, favs)]);
    const card = await replaceTripPlace(tripId, againId, run.owner, { client: first.client, key: "call-again" });
    expect(card?.name).toBe("First pick");

    // The retry would find another place; it must not even search.
    const second = fakeClient([rawPlace(entity("second-pick"), "Second pick", 0.9, favs)]);
    const repeat = await replaceTripPlace(tripId, againId, run.owner, { client: second.client, key: "call-again" });
    expect(repeat?.tripPlaceId).toBe(card?.tripPlaceId);
    expect(second.urls).toHaveLength(0);

    const [removed] = await db.select().from(tripPlaces).where(eq(tripPlaces.id, againId));
    expect(removed).toMatchObject({ status: "removed", replacedBy: card?.tripPlaceId, replacementKey: "call-again" });
    const names = (await listTripPlaceCards(tripId, run.owner)).map((c) => c.name);
    expect(names).not.toContain("Second pick");
  });

  it("searches on the same signals as the board: artists and films, and itinerary picks as a plain driver", async () => {
    const ARTIST = entity("artist");
    await setMediaFavorites(clientId, [{ query: "khruangbin", kind: "artist", entityId: ARTIST, name: "Khruangbin" }], run.owner);
    const placeIds = await upsertPlaces([
      { entityId: entity("pick"), name: "Picked place", primaryType: "urn:tag:genre:place:restaurant" },
      { entityId: entity("dropped"), name: "Dropped place", primaryType: "urn:tag:genre:place:restaurant" },
    ]);
    const written = await upsertTripPlaces(
      tripId,
      [
        { placeId: placeIds[entity("pick")]!, source: "ask", category: "eat", bestAffinity: 0.75, bestScore: 70 },
        { placeId: placeIds[entity("dropped")]!, source: "ask", category: "eat", bestAffinity: 0.74, bestScore: 65 },
      ],
      run.owner,
    );
    const droppedId = written[placeIds[entity("dropped")]!]!;
    await setSlots(
      tripId,
      [
        { day: 1, slot: "lunch", tripPlaceId: written[placeIds[entity("pick")]!]! },
        { day: 1, slot: "dinner", tripPlaceId: droppedId },
      ],
      "merge",
      run.owner,
    );

    const raw = rawPlace(entity("after-pick"), "After the pick", 0.8, favs);
    raw.query = {
      ...raw.query,
      explainability: {
        "signal.interests.entities": [
          { entity_id: FAV_A, score: 0.5 },
          { entity_id: ARTIST, score: 0.2 },
          { entity_id: entity("pick"), score: 0.3 },
        ],
      },
    };
    const { client, urls } = fakeClient([raw]);
    const card = await replaceTripPlace(tripId, droppedId, run.owner, { client });

    const signals = [FAV_A, FAV_B, ARTIST, entity("pick")];
    // The dropped place left the itinerary with the removal: it is no pick any more.
    expect(urls[0]!.searchParams.get("signal.interests.entities")).toBe(signals.join(","));
    expect(card?.because).toEqual([
      { entityId: FAV_A, name: "Via Carota", share: 50 },
      { entityId: ARTIST, name: "Khruangbin", share: 20, media: true },
      { entityId: "trip-picks", name: "This trip's picks", share: 30 },
    ]);
    const [row] = await db.select().from(tripPlaces).where(eq(tripPlaces.id, card!.tripPlaceId));
    expect(row?.signalHash).toBe(signalSetHash(signals));
  });
});
