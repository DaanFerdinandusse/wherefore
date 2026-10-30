import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/clients";
import type { FindPlacesOutput } from "@/lib/contracts";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { chats, tripAsks } from "@/lib/db/schema";
import insightsFixture from "@/lib/qloo/__fixtures__/insights-place.json";
import type { FindPlacesInput, FindPlacesResult } from "@/lib/qloo/contracts";
import { normalizePlace } from "@/lib/qloo/normalize";
import { createTrip } from "@/lib/trips";
import { placeFactsOf } from "@/lib/trips/map";

import type { TurnRef } from "../writes";

import { findPlacesTool } from "./find-places";
import { loosenedCopy, WIDENED_IN_CATEGORY } from "./labels";
import { DATA_OPEN, findPlacesForModel } from "./model-output";
import { removePlaceTool } from "./place-tools";

// find_places and remove_place end to end on the database, with the search and
// the model stubbed: what reaches the search, what lands on the ask, what the
// advisor is told.

const mocks = vi.hoisted(() => ({ findPlaces: vi.fn(), findTags: vi.fn() }));
vi.mock("@/lib/qloo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/qloo")>()),
  findPlaces: mocks.findPlaces,
  findTags: mocks.findTags,
}));
vi.mock("../explain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../explain")>()),
  explainPlaces: async () => ({ reasons: new Map() }),
}));
vi.mock("@/lib/codex/provider", () => ({ agentModelRef: () => "test", agentProviderOptions: () => ({}) }));

const run = testRun();
const template = insightsFixture.results.entities[0]!;
let turn: TurnRef;
let call = 0;

function found(ids: string[], loosened: FindPlacesResult["loosened"] = []): FindPlacesResult {
  const results = ids.map((id, index) => ({
    place: normalizePlace({ ...template, entity_id: `${run.entityPrefix}${id}`, name: id }),
    category: "eat" as const,
    affinity: 0.8 - index * 0.01,
    score: 90 - index,
    signalScores: [],
    distanceM: null,
  }));
  return { results, loosened, localityCheck: { requested: "Lisbon", resolved: "Lisbon", ok: true, dropped: 0 }, calls: [] };
}

async function drain(generator: AsyncGenerator<FindPlacesOutput, FindPlacesOutput>): Promise<FindPlacesOutput> {
  for (;;) {
    const step = await generator.next();
    if (step.done) return step.value;
  }
}

const searchInput = (index: number) => mocks.findPlaces.mock.calls[index]![0] as FindPlacesInput;

describe.skipIf(!hasDatabase)("search options through the tools", () => {
  beforeAll(async () => {
    const client = await createClient({ name: "Ana Ruiz", groundRules: ["No shellfish", "Walkable evenings"] }, run.owner);
    const created = await createTrip(run.owner, {
      clientId: client.id,
      destination: LISBON,
      startDate: "2027-05-14", // A Friday.
      endDate: "2027-05-18",
      datesMode: "exact",
      adults: 1,
      children: 0,
      travelers: [],
    });
    turn = { chatId: created.chatId, tripId: created.trip.id, turnId: randomUUID() };
    await db.update(chats).set({ activeTurnId: turn.turnId }).where(eq(chats.id, turn.chatId));
  });

  afterAll(() => cleanup(run));

  beforeEach(() => {
    mocks.findPlaces.mockReset();
    mocks.findTags.mockReset();
    mocks.findTags.mockResolvedValue({ tags: [{ tagId: "urn:tag:genre:place:restaurant:seafood", name: "Seafood" }], calls: [] });
  });

  it("sends the options from the slot's real date, and keeps them on the ask", async () => {
    mocks.findPlaces.mockResolvedValue(found(["slot-a"]));
    const output = await drain(
      findPlacesTool(
        { intent: "dinner", target: { day: 3, slot: "dinner" }, discovery: "less_known", michelin: true },
        turn,
        `call-${++call}`,
      ),
    );
    expect(searchInput(0)).toMatchObject({ popularityMax: 0.6, michelin: true, openDay: "sunday" });
    expect(output.openDay).toBe("sunday");
    const [ask] = await db.select({ query: tripAsks.query }).from(tripAsks).where(eq(tripAsks.id, output.askId!));
    expect(ask?.query).toMatchObject({ popularityMax: 0.6, michelin: true, openDay: "sunday" });
  });

  it("reads the facts back through the card query and puts the ground rules beside them", async () => {
    mocks.findPlaces.mockResolvedValue(found(["facts-a"]));
    const output = await drain(findPlacesTool({ intent: "dinner" }, turn, `call-${++call}`));
    const facts = placeFactsOf(normalizePlace(template));
    const [card] = output.places;
    expect(card).toMatchObject({ rating: facts.rating, about: facts.about, practical: facts.practical });
    expect(card?.practical).toBeDefined();
    expect(output.groundRules).toEqual(["No shellfish", "Walkable evenings"]);

    const { value } = findPlacesForModel(output);
    expect(value).toContain('"ground_rules":["No shellfish","Walkable evenings"]');
    expect(value).toContain(`"about":${JSON.stringify(facts.about)}`);
    expect(value).toContain('"practical":{');
    expect(value.startsWith(DATA_OPEN)).toBe(true);
  });

  it("sends no open day for the stay slot, and nothing unasked", async () => {
    mocks.findPlaces.mockResolvedValue(found(["stay-a"]));
    await drain(findPlacesTool({ intent: "hotels", target: { day: 1, slot: "stay" } }, turn, `call-${++call}`));
    const input = searchInput(0);
    expect(input.openDay).toBeUndefined();
    expect(input.popularityMax).toBeUndefined();
    expect(input.michelin).toBeUndefined();
  });

  it("reads the open day from a day hint", async () => {
    mocks.findPlaces.mockResolvedValue(found(["hint-a"]));
    await drain(findPlacesTool({ intent: "lunch", day_hint: "Saturday" }, turn, `call-${++call}`));
    expect(searchInput(0).openDay).toBe("saturday");
  });

  it("passes the options on the fill call and still reports every drop next to the widened category", async () => {
    mocks.findPlaces
      .mockResolvedValueOnce(found(["fill-exact"], ["tags", "popularity", "hours"]))
      .mockResolvedValueOnce(found(["fill-a", "fill-b"], ["tags", "michelin"]));
    // The fixture's own tags hold the exact match.
    mocks.findTags.mockResolvedValue({ tags: [{ tagId: template.tags[0]!.id, name: "Seafood" }], calls: [] });
    const output = await drain(
      findPlacesTool(
        { intent: "seafood restaurants", tags: ["seafood"], target: { day: 1, slot: "dinner" }, discovery: "less_known", michelin: true },
        turn,
        `call-${++call}`,
      ),
    );
    expect(searchInput(1)).toMatchObject({ popularityMax: 0.6, michelin: true, openDay: "friday" });
    expect(output.loosened).toEqual(["popularity", "hours", "michelin", WIDENED_IN_CATEGORY]);
    expect(loosenedCopy(output.loosened, output.openDay)).toContain("Too few places are open on Friday, so check the hours on these.");
  });

  it("reruns the ask's options on remove_place and says what it loosened", async () => {
    mocks.findPlaces.mockResolvedValueOnce(found(["rerun-a"]));
    const first = await drain(
      findPlacesTool({ intent: "dinner", target: { day: 1, slot: "dinner" }, discovery: "less_known", michelin: true }, turn, `call-${++call}`),
    );
    mocks.findPlaces.mockResolvedValueOnce(found(["rerun-b"], ["hours"]));
    const removed = await removePlaceTool({ place_id: first.places[0]!.tripPlaceId, replace: true }, turn, `call-${++call}`);
    expect(searchInput(1)).toMatchObject({ popularityMax: 0.6, michelin: true, openDay: "friday" });
    expect(removed.replacement?.name).toBe("rerun-b");
    expect(removed.note).toBe("Too few places are open on Friday, so check the hours on these.");
  });
});
