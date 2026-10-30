import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/clients";
import type { FindPlacesOutput } from "@/lib/contracts";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { askPlaces, chats, tripAsks } from "@/lib/db/schema";
import insightsFixture from "@/lib/qloo/__fixtures__/insights-place.json";
import type { FindPlacesInput, FindPlacesResult } from "@/lib/qloo/contracts";
import { normalizePlace } from "@/lib/qloo/normalize";
import { upsertPlaces } from "@/lib/places";
import { addAskPlaces, createTrip, upsertTripPlaces } from "@/lib/trips";
import { placeFactsOf } from "@/lib/trips/map";

import type { TurnRef } from "../writes";

import { findPlacesTool, isOtherKindTag } from "./find-places";
import { loosenedCopy, WIDENED_IN_CATEGORY } from "./labels";
import { DATA_OPEN, findPlacesForModel } from "./model-output";
import { removePlaceTool } from "./place-tools";

// find_places and remove_place end to end on the database, with the search and
// the model stubbed: what reaches the search, what lands on the ask, what the
// advisor is told.

const mocks = vi.hoisted(() => ({
  findPlaces: vi.fn(),
  findTags: vi.fn(),
  resolveLocality: vi.fn(),
  duringExplain: undefined as ((tripPlaceId: string) => Promise<void>) | undefined,
}));
vi.mock("@/lib/qloo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/qloo")>()),
  findPlaces: mocks.findPlaces,
  findTags: mocks.findTags,
  resolveLocality: mocks.resolveLocality,
}));
vi.mock("../explain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../explain")>()),
  explainPlaces: async (inputs: { tripPlaceId: string }[]) => {
    await mocks.duringExplain?.(inputs[0]!.tripPlaceId);
    return { reasons: new Map() };
  },
}));
vi.mock("@/lib/codex/provider", () => ({ agentModelRef: () => "test", agentProviderOptions: () => ({}) }));

const run = testRun();
const template = insightsFixture.results.entities[0]!;
let turn: TurnRef;
let call = 0;

/** A search answer. `perResult`: what the results themselves needed, when that is less than the search tried. */
function found(
  ids: string[],
  loosened: FindPlacesResult["loosened"] = [],
  perResult: FindPlacesResult["loosened"] = loosened,
): FindPlacesResult {
  const results = ids.map((id, index) => ({
    place: normalizePlace({ ...template, entity_id: `${run.entityPrefix}${id}`, name: id }),
    category: "eat" as const,
    affinity: 0.8 - index * 0.01,
    score: 90 - index,
    signalScores: [],
    distanceM: null,
    ...(perResult.length ? { loosened: perResult } : {}),
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
    mocks.resolveLocality.mockReset();
    mocks.duringExplain = undefined;
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
    expect(searchInput(0)).toMatchObject({ popularityMax: 0.6, michelin: true, openDay: "sunday", openSlot: "dinner" });
    expect(output.openDay).toBe("sunday");
    const [ask] = await db.select({ query: tripAsks.query }).from(tripAsks).where(eq(tripAsks.id, output.askId!));
    expect(ask?.query).toMatchObject({ popularityMax: 0.6, michelin: true, openDay: "sunday", openSlot: "dinner" });
  });

  it("leaves out what is not the asked kind of place, and reads the scores of this search in order", async () => {
    const results = found(["kind-a", "kind-cafe", "kind-b"]);
    mocks.findPlaces.mockResolvedValue({
      ...results,
      results: results.results.map((r) => (r.place.name === "kind-cafe" ? { ...r, category: "coffee" as const } : r)),
    });
    const output = await drain(findPlacesTool({ intent: "dinner", target: { day: 2, slot: "dinner" } }, turn, `call-${++call}`));
    expect(output.places.map((p) => p.name)).toEqual(["kind-a", "kind-b"]);
    expect(output.places.map((p) => p.score)).toEqual([94, 60]);

    // A place found again on the same signals takes this search's score.
    mocks.findPlaces.mockResolvedValue(found(["kind-new", "kind-a", "kind-b"]));
    const again = await drain(findPlacesTool({ intent: "another dinner" }, turn, `call-${++call}`));
    const scores = again.places.map((p) => p.score ?? 0);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("does not search on a kind of place from another category", () => {
    expect(isOtherKindTag("urn:tag:category:place:boutique", "stay")).toBe(true);
    expect(isOtherKindTag("urn:tag:category:place:boutique_hotel", "stay")).toBe(false);
    expect(isOtherKindTag("urn:tag:category:place:italian_restaurant", "eat")).toBe(false);
    expect(isOtherKindTag("urn:tag:genre:place:restaurant:seafood", "stay")).toBe(false);
    expect(isOtherKindTag("urn:tag:category:place:boutique", undefined)).toBe(false);
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
    expect(loosenedCopy(output.loosened, output.openDay)).toContain("Too few places are listed as open on Friday, so check the hours on these.");
  });

  it("reports only what the kept fillers needed, not everything the fill tried", async () => {
    mocks.findPlaces
      .mockResolvedValueOnce(found(["kept-exact"], ["tags"], []))
      .mockResolvedValueOnce(found(["kept-a"], ["michelin", "hours"], []));
    mocks.findTags.mockResolvedValue({ tags: [{ tagId: template.tags[0]!.id, name: "Seafood" }], calls: [] });
    const output = await drain(
      findPlacesTool({ intent: "seafood restaurants", tags: ["seafood"], target: { day: 1, slot: "dinner" }, michelin: true }, turn, `call-${++call}`),
    );
    expect(output.loosened).toEqual([WIDENED_IN_CATEGORY]);
  });

  it("marks a card with no hours for that day, for the model", async () => {
    const answer = found(["hours-known", "hours-none"]);
    answer.results[1] = { ...answer.results[1]!, place: { ...answer.results[1]!.place, properties: {} } };
    mocks.findPlaces.mockResolvedValue(answer);
    const output = await drain(findPlacesTool({ intent: "dinner", target: { day: 1, slot: "dinner" } }, turn, `call-${++call}`));
    const none = output.places.find((c) => c.name === "hours-none")!;
    expect(output.hoursUnknown).toEqual([none.tripPlaceId]);
    const { value } = findPlacesForModel(output);
    expect(value.match(/"hours_unknown":true/g)).toHaveLength(1);
    expect(value.indexOf('"hours_unknown":true')).toBeGreaterThan(value.indexOf('"name":"hours-none"'));
  });

  it("leaves a place the advisor replaced during the explain step in the ask's tab", async () => {
    mocks.findPlaces.mockResolvedValue(found(["tab-a", "tab-b"]));
    const entityId = `${run.entityPrefix}tab-replacement`;
    const placeIds = await upsertPlaces([{ entityId, name: "Tab replacement" }]);
    const written = await upsertTripPlaces(turn.tripId, [{ placeId: placeIds[entityId]!, source: "manual", category: "eat" }], run.owner);
    const replacement = written[placeIds[entityId]!]!;
    mocks.duringExplain = async (tripPlaceId) => {
      const [row] = await db.select({ askId: askPlaces.askId }).from(askPlaces).where(eq(askPlaces.tripPlaceId, tripPlaceId));
      await addAskPlaces(row!.askId, [{ tripPlaceId: replacement, rank: 1 }], run.owner);
    };
    const output = await drain(findPlacesTool({ intent: "dinner" }, turn, `call-${++call}`));
    const rows = await db.select({ tripPlaceId: askPlaces.tripPlaceId }).from(askPlaces).where(eq(askPlaces.askId, output.askId!));
    expect(rows.map((r) => r.tripPlaceId)).toContain(replacement);
    expect(rows).toHaveLength(3);
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
    expect(removed.note).toBe("Too few places are listed as open on Friday, so check the hours of this one.");
  });

  it("reruns the tag ids, the price cap and the area on remove_place, not only the options", async () => {
    mocks.resolveLocality.mockResolvedValue({
      candidates: [{ name: "Alfama", lat: LISBON.lat + 0.01, lon: LISBON.lon + 0.01 }],
      calls: [],
    });
    mocks.findPlaces.mockResolvedValueOnce(found(["area-a"]));
    const first = await drain(
      findPlacesTool({ intent: "seafood restaurants", tags: ["seafood"], price_max: 2, area: "Alfama" }, turn, `call-${++call}`),
    );
    mocks.findPlaces.mockResolvedValueOnce(found(["area-b"]));
    await removePlaceTool({ place_id: first.places[0]!.tripPlaceId, replace: true }, turn, `call-${++call}`);
    expect(searchInput(1)).toMatchObject({
      tags: searchInput(0).tags,
      priceMax: 2,
      destination: { name: LISBON.name, lat: LISBON.lat + 0.01, lon: LISBON.lon + 0.01, radiusM: 1_500 },
    });
  });

  it("keeps quiet about a drop the replacement did not need", async () => {
    mocks.findPlaces.mockResolvedValueOnce(found(["quiet-a"]));
    const first = await drain(findPlacesTool({ intent: "dinner", target: { day: 1, slot: "dinner" } }, turn, `call-${++call}`));
    mocks.findPlaces.mockResolvedValueOnce(found(["quiet-b"], ["popularity", "hours"], []));
    const removed = await removePlaceTool({ place_id: first.places[0]!.tripPlaceId, replace: true }, turn, `call-${++call}`);
    expect(removed.replacement?.name).toBe("quiet-b");
    expect(removed.note).toBeUndefined();
  });

  it("skips a place already on the trip when the search returns it, and says when the pick is another kind", async () => {
    mocks.findPlaces.mockResolvedValueOnce(found(["dup-a", "dup-b"]));
    const first = await drain(findPlacesTool({ intent: "dinner" }, turn, `call-${++call}`));
    const answer = found(["dup-b", "dup-c"]);
    answer.results[1] = { ...answer.results[1]!, category: "stay" };
    mocks.findPlaces.mockResolvedValueOnce(answer);
    const removed = await removePlaceTool({ place_id: first.places[0]!.tripPlaceId, replace: true }, turn, `call-${++call}`);
    expect(removed.replacement?.name).toBe("dup-c");
    expect(removed.note).toBe("Nothing of the same kind was left, so this one is a different kind of place.");
  });
});
