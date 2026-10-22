import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { addFavorite, createClient } from "@/lib/clients";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { askPlaces, tripCalls, tripPlaces } from "@/lib/db/schema";
import { upsertPlaces } from "@/lib/places";
import insightsFixture from "@/lib/qloo/__fixtures__/insights-place.json";
import { memoryCacheStore } from "@/lib/qloo/cache";
import { createQlooClient } from "@/lib/qloo/client";
import type { PlaceResult } from "@/lib/qloo/contracts";
import { addAskPlaces, createAsk, createTrip, listTripPlaceCards, upsertTripPlaces } from "@/lib/trips";
import { pickReplacement, replaceTripPlace, replacementQuery } from "@/lib/trips/replace";

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

describe.skipIf(!hasDatabase)("replaceTripPlace", () => {
  const run = testRun();
  const entity = (key: string) => `${run.entityPrefix}${key}`;
  let tripId = "";
  let removedId = "";
  let keptEntity = "";
  let askId = "";
  const FAV_A = entity("fav-a");
  const FAV_B = entity("fav-b");
  const favs: [string, string] = [FAV_A, FAV_B];

  beforeAll(async () => {
    const client = await createClient({ name: "Ana Ruiz", homeCity: "New York" }, run.owner);
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
    // Scored against the trip's own affinities (0.81, 0.80, 0.79): the middle.
    expect(card?.score).toBe(77);
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
});
