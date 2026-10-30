import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { addFavorite, createClient, setMediaFavorites } from "@/lib/clients";
import type { FindPlacesOutput, PlaceTag } from "@/lib/contracts";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { askPlaces, chats, tripAsks, tripPlaces } from "@/lib/db/schema";
import { upsertPlaces } from "@/lib/places";
import insightsFixture from "@/lib/qloo/__fixtures__/insights-place.json";
import type { FindPlacesResult } from "@/lib/qloo/contracts";
import { normalizePlace } from "@/lib/qloo/normalize";
import { createTrip } from "@/lib/trips";

import type { TurnRef } from "../writes";

import { findPlacesTool, parseCheckpoint, type AskCheckpoint } from "./find-places";

// Specific reasons end to end on the database, with the search and the model
// stubbed: what the explain step reads, what it stores, and what a later
// search of the same place leaves behind.

const mocks = vi.hoisted(() => ({ findPlaces: vi.fn() }));
vi.mock("@/lib/qloo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/qloo")>()),
  findPlaces: mocks.findPlaces,
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: async () => ({ text: '{"reasons":[]}' }),
}));
vi.mock("@/lib/codex/workflow-model", () => ({ registryModel: () => "test" }));
vi.mock("@/lib/codex/provider", () => ({ agentModelRef: () => "test", agentProviderOptions: () => ({}) }));

const run = testRun();
const template = insightsFixture.results.entities[0]!;
const entity = (name: string) => `${run.entityPrefix}${name}`;
const tag = (name: string, type: string): PlaceTag => ({ tagId: `urn:tag:test:${name}`, name, type });
const CUISINE = "urn:tag:cuisine:qloo";
const AMBIENCE = "urn:tag:ambience:qloo";

const DA_NOI = [tag("Italian", CUISINE), tag("Warm", AMBIENCE), tag("Stylish", AMBIENCE), tag("Casual", AMBIENCE)];
let turn: TurnRef;
let call = 0;

const DRIVERS = () => [
  { entityId: entity("lilia"), score: 0.4 },
  { entityId: entity("via"), score: 0.3 },
  { entityId: entity("band"), score: 0.3 },
];

function found(affinity: number, drivers: { entityId: string; score: number }[] = DRIVERS()): FindPlacesResult {
  const candidate = (name: string, tags: PlaceTag[], score: number) => ({
    place: { ...normalizePlace({ ...template, entity_id: entity(name), name }), tags },
    category: "eat" as const,
    affinity: affinity - (90 - score) * 0.01,
    score,
    signalScores: drivers,
    distanceM: null,
  });
  return {
    results: [candidate("da-noi", DA_NOI, 90), candidate("other", [tag("Lively", AMBIENCE)], 80)],
    loosened: [],
    localityCheck: { requested: "Lisbon", resolved: "Lisbon", ok: true, dropped: 0 },
    calls: [],
  };
}

async function drain(generator: AsyncGenerator<FindPlacesOutput, FindPlacesOutput>): Promise<FindPlacesOutput> {
  for (;;) {
    const step = await generator.next();
    if (step.done) return step.value;
  }
}

const LIKE = { entityId: "", name: "Via Carota", share: 30, tags: ["Italian", "Warm", "Stylish"] };

describe.skipIf(!hasDatabase)("specific reasons through find_places", () => {
  let output: FindPlacesOutput;

  beforeAll(async () => {
    LIKE.entityId = entity("via");
    const client = await createClient({ name: "Ana Ruiz" }, run.owner);
    const placeIds = await upsertPlaces([
      { entityId: entity("via"), name: "Via Carota", tags: [tag("Italian", CUISINE), tag("Warm", AMBIENCE), tag("Stylish", AMBIENCE), tag("Cozy", AMBIENCE)] },
      { entityId: entity("lilia"), name: "Lilia", tags: [tag("Italian", CUISINE)] },
    ]);
    await addFavorite(client.id, { query: "via", entityId: entity("via"), placeId: placeIds[entity("via")], match: "resolved", candidates: [] }, run.owner);
    await addFavorite(client.id, { query: "lilia", entityId: entity("lilia"), placeId: placeIds[entity("lilia")], match: "resolved", candidates: [] }, run.owner);
    await setMediaFavorites(client.id, [{ query: "khruangbin", kind: "artist", entityId: entity("band"), name: "Khruangbin" }], run.owner);
    const created = await createTrip(run.owner, {
      clientId: client.id,
      destination: LISBON,
      datesMode: "unset",
      adults: 1,
      children: 0,
      travelers: [],
    });
    turn = { chatId: created.chatId, tripId: created.trip.id, turnId: randomUUID() };
    await db.update(chats).set({ activeTurnId: turn.turnId }).where(eq(chats.id, turn.chatId));

    mocks.findPlaces.mockResolvedValue(found(0.8));
    output = await drain(findPlacesTool({ intent: "dinner" }, turn, `${run.entityPrefix}call-${++call}`));
  });

  afterAll(() => cleanup(run));

  const daNoi = (result: FindPlacesOutput) => result.places.find((p) => p.name === "da-noi")!;

  it("stores the favorite, its tags and the sentence on the trip place", async () => {
    const card = daNoi(output);
    expect(card.reason).toBe("Like Via Carota: Italian, warm and stylish. Also fits Ana's love of Khruangbin.");
    expect(card.because.find((d) => d.tags)).toEqual(LIKE);
    expect(card.because.find((d) => d.entityId === entity("band"))?.media).toBe(true);
    const [row] = await db.select().from(tripPlaces).where(eq(tripPlaces.id, card.tripPlaceId));
    expect(row?.reason).toBe(card.reason);
    expect(row?.explainability).toEqual(card.because);
  });

  it("leaves the place with too little overlap on the plain sentence", () => {
    const other = output.places.find((p) => p.name === "other")!;
    expect(other.because.some((d) => d.tags)).toBe(false);
    expect(other.reason?.startsWith("Because Ana loves")).toBe(true);
  });

  it("stores the tags on the ask's row and in its checkpoint", async () => {
    const card = daNoi(output);
    const [row] = await db
      .select({ explainability: askPlaces.explainability })
      .from(askPlaces)
      .where(and(eq(askPlaces.askId, output.askId!), eq(askPlaces.tripPlaceId, card.tripPlaceId)));
    expect(row?.explainability.find((d) => d.tags)).toEqual(LIKE);

    const [ask] = await db.select({ checkpoint: tripAsks.checkpoint }).from(tripAsks).where(eq(tripAsks.id, output.askId!));
    const checkpoint = parseCheckpoint(ask?.checkpoint);
    const ranked = checkpoint.search?.ranked.find((r) => r.tripPlaceId === card.tripPlaceId);
    expect(ranked?.explainability.find((d) => d.tags)).toEqual(LIKE);
    expect(ranked?.explainability.find((d) => d.media)?.name).toBe("Khruangbin");
  });

  it("keeps the reason and the tags of a place found again on weaker evidence", async () => {
    mocks.findPlaces.mockResolvedValue(found(0.7));
    const again = await drain(findPlacesTool({ intent: "a third dinner" }, turn, `${run.entityPrefix}call-${++call}`));
    expect(daNoi(again).reason).toBe("Like Via Carota: Italian, warm and stylish. Also fits Ana's love of Khruangbin.");
    expect(daNoi(again).because.find((d) => d.tags)).toEqual(LIKE);
  });

  it("writes tags and reason again on the new drivers when newer evidence replaces them", async () => {
    mocks.findPlaces.mockResolvedValue(found(0.9));
    const again = await drain(findPlacesTool({ intent: "another dinner" }, turn, `${run.entityPrefix}call-${++call}`));
    expect(daNoi(again).score).toBe(90);
    expect(daNoi(again).reason).toBe("Like Via Carota: Italian, warm and stylish. Also fits Ana's love of Khruangbin.");
    expect(daNoi(again).because.find((d) => d.tags)).toEqual(LIKE);

    // Via Carota is no driver any more: its reason must not outlive it.
    mocks.findPlaces.mockResolvedValue(found(0.95, [{ entityId: entity("lilia"), score: 1 }]));
    const moved = await drain(findPlacesTool({ intent: "one more dinner" }, turn, `${run.entityPrefix}call-${++call}`));
    expect(daNoi(moved).reason).toBe("Because Ana loves Lilia.");
    expect(daNoi(moved).because.some((d) => d.tags)).toBe(false);
  });
});

describe("the ask's checkpoint", () => {
  it("keeps tags and the media mark through a round trip", () => {
    const explainability = [
      { entityId: "e-via", name: "Via Carota", share: 30, tags: ["Italian", "Warm"] },
      { entityId: "e-band", name: "Khruangbin", share: 30, media: true },
      { entityId: "other", name: "Other favorites", share: 40 },
    ];
    const ranked = [{ tripPlaceId: "tp", entityId: "e", category: "eat" as const, affinity: 0.8, score: 90, explainability }];
    const checkpoint: AskCheckpoint = {
      search: { ranked, loosened: [], details: "Lisbon", note: "1 found", constraints: { tagIds: [] } },
    };
    expect(parseCheckpoint(JSON.parse(JSON.stringify(checkpoint)))).toEqual(checkpoint);
  });

  it("reads an older checkpoint without tags, and none at all", () => {
    const ranked = [{ tripPlaceId: "tp", entityId: "e", category: "eat", affinity: 0.8, score: 90, explainability: [{ entityId: "e-via", name: "Via Carota", share: 100 }] }];
    expect(parseCheckpoint({ score: { ranked, step: { key: "score", label: "Score", state: "done" } } }).score?.ranked).toEqual(ranked);
    expect(parseCheckpoint(null)).toEqual({});
    expect(parseCheckpoint({ search: "nonsense" })).toEqual({});
  });
});
