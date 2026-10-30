import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { addFavorite, createClient } from "@/lib/clients";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { chats } from "@/lib/db/schema";
import { upsertPlaces } from "@/lib/places";
import insightsFixture from "@/lib/qloo/__fixtures__/insights-place.json";
import type { ScoreEntitiesInput } from "@/lib/qloo/contracts";
import { normalizePlace } from "@/lib/qloo/normalize";
import { createTrip, setSlots, upsertTripPlaces } from "@/lib/trips";
import { signalSetHash } from "@/lib/trips/evidence";

import type { TurnRef } from "../writes";

import { scorePlacesTool } from "./score-places";

// The scale a score sits on, on the database with the provider stubbed.

const mocks = vi.hoisted(() => ({ scoreEntities: vi.fn() }));
vi.mock("@/lib/qloo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/qloo")>()),
  scoreEntities: mocks.scoreEntities,
}));

const run = testRun();
const template = insightsFixture.results.entities[0]!;
const entity = (key: string) => `${run.entityPrefix}${key}`;
const affinities: Record<string, number> = {};
let turn: TurnRef;
let pickId = "";
let boardId = "";

describe.skipIf(!hasDatabase)("score_places scale", () => {
  beforeAll(async () => {
    const client = await createClient({ name: "Ana Ruiz" }, run.owner);
    const placeIds = await upsertPlaces([
      { entityId: entity("via"), name: "Via Carota" },
      { entityId: entity("lilia"), name: "Lilia" },
      { entityId: entity("pick"), name: "In the itinerary" },
      { entityId: entity("board"), name: "On the board" },
      { entityId: entity("board-low"), name: "Low on the board" },
    ]);
    await addFavorite(client.id, { query: "via", entityId: entity("via"), placeId: placeIds[entity("via")], match: "resolved", candidates: [] }, run.owner);
    await addFavorite(client.id, { query: "lilia", entityId: entity("lilia"), placeId: placeIds[entity("lilia")], match: "resolved", candidates: [] }, run.owner);
    const created = await createTrip(run.owner, {
      clientId: client.id,
      destination: LISBON,
      startDate: "2027-05-14",
      endDate: "2027-05-16",
      datesMode: "exact",
      adults: 1,
      children: 0,
      travelers: [],
    });
    turn = { chatId: created.chatId, tripId: created.trip.id, turnId: randomUUID() };
    await db.update(chats).set({ activeTurnId: turn.turnId }).where(eq(chats.id, turn.chatId));
    const signalHash = signalSetHash([entity("via"), entity("lilia"), entity("pick")]);
    const written = await upsertTripPlaces(
      turn.tripId,
      [
        { placeId: placeIds[entity("pick")]!, source: "ask", category: "eat", bestAffinity: 0.7, bestScore: 80, signalHash },
        { placeId: placeIds[entity("board")]!, source: "ask", category: "eat", bestAffinity: 0.9, bestScore: 94, signalHash },
        { placeId: placeIds[entity("board-low")]!, source: "ask", category: "eat", bestAffinity: 0.85, bestScore: 60, signalHash },
      ],
      run.owner,
    );
    pickId = written[placeIds[entity("pick")]!]!;
    boardId = written[placeIds[entity("board")]!]!;
    await setSlots(turn.tripId, [{ day: 1, slot: "dinner", tripPlaceId: pickId }], "merge", run.owner);
  });

  afterAll(() => cleanup(run));

  beforeEach(() => {
    mocks.scoreEntities.mockReset();
    mocks.scoreEntities.mockImplementation(async (input: ScoreEntitiesInput) => ({
      calls: [],
      scores: input.entityIds.map((entityId) => ({
        entityId,
        name: entityId,
        affinity: affinities[entityId] ?? 0.5,
        signalScores: [],
        explainability: [],
        place: normalizePlace({ ...template, entity_id: entityId, name: entityId }),
      })),
    }));
  });

  it("ranks a place on the full signals against the board's stored affinities", async () => {
    affinities[entity("board")] = 0.875;
    const output = await scorePlacesTool({ place_ids: [boardId] }, turn, `${run.entityPrefix}full`);
    const input = mocks.scoreEntities.mock.calls[0]![0] as ScoreEntitiesInput;
    expect(input.signals).toEqual([entity("via"), entity("lilia"), entity("pick")]);
    expect(input.entityIds).toEqual([entity("board")]);
    // Second of the stored 0.90, 0.85 and 0.70.
    expect(output.places[0]?.score).toBe(77);
  });

  it("scores the scale on the same reduced signals when a pick is scored without itself", async () => {
    affinities[entity("pick")] = 0.7;
    affinities[entity("board")] = 0.6;
    affinities[entity("board-low")] = 0.5;
    const output = await scorePlacesTool({ place_ids: [pickId] }, turn, `${run.entityPrefix}pick`);
    const input = mocks.scoreEntities.mock.calls[0]![0] as ScoreEntitiesInput;
    expect(input.signals).toEqual([entity("via"), entity("lilia")]);
    expect([...input.entityIds].sort()).toEqual([entity("board"), entity("board-low"), entity("pick")].sort());
    // Top of what it was scored with, not ranked under the board's full-signal 0.90 and 0.85.
    expect(output.places).toHaveLength(1);
    expect(output.places[0]?.score).toBe(94);
  });
});
