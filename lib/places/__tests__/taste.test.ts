import { afterAll, describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/auth/errors";
import { cleanup, hasDatabase, testRun } from "@/lib/db/__tests__/fixtures";
import { getAdvisorPlaceForPlace, listAdvisorPlaces, saveAdvisorPlace, upsertPlaces } from "@/lib/places";
import { restoreAdvisorPlace, takeAdvisorPlace } from "@/lib/places/mutations";
import { advisorPlacesByEntityIds } from "@/lib/places/queries";
import { TASTE_SIGNAL_MAX, tasteSignalsFor } from "@/lib/places/taste";

describe("tasteSignalsFor", () => {
  it("puts the most recent saves first, each id once", () => {
    const signals = tasteSignalsFor([
      { entityId: "A", savedAt: "2026-01-01T00:00:00Z" },
      { entityId: "B", savedAt: "2026-03-01T00:00:00Z" },
      { entityId: "A", savedAt: "2026-02-01T00:00:00Z" },
      { entityId: " ", savedAt: "2026-04-01T00:00:00Z" },
      { entityId: "C", savedAt: new Date("2026-03-01T00:00:00Z") },
    ]);
    expect(signals).toEqual(["B", "C", "A"]);
  });

  it("caps at the portrait's input limit", () => {
    const places = Array.from({ length: 30 }, (_, i) => ({
      entityId: `E${String(i).padStart(2, "0")}`,
      savedAt: new Date(Date.UTC(2026, 0, 1 + i)),
    }));
    const signals = tasteSignalsFor(places);
    expect(signals).toHaveLength(TASTE_SIGNAL_MAX);
    expect(signals[0]).toBe("E29");
    expect(tasteSignalsFor(places, 3)).toEqual(["E29", "E28", "E27"]);
    expect(tasteSignalsFor([])).toEqual([]);
  });
});

const run = testRun();
const entity = (key: string) => `${run.entityPrefix}${key}`;

describe.skipIf(!hasDatabase)("remove and undo", () => {
  afterAll(() => cleanup(run));

  it("puts a removed place back with its id, note and saved date", async () => {
    const ids = await upsertPlaces([{ entityId: entity("uva"), name: "Senhor Uva", city: "Lisbon" }]);
    const placeId = ids[entity("uva")]!;
    const saved = await saveAdvisorPlace(run.owner, { placeId, note: "Sit at the bar" });
    expect(await advisorPlacesByEntityIds(run.owner, [entity("uva"), entity("none")])).toEqual({
      [entity("uva")]: { id: saved.id, city: "Lisbon" },
    });

    const removed = await takeAdvisorPlace(saved.id, run.owner);
    expect(removed).toMatchObject({ id: saved.id, placeId, note: "Sit at the bar", tripPlaceIds: [] });
    expect(await getAdvisorPlaceForPlace(run.owner, placeId)).toBeNull();

    // A restore always lands in the caller's own list, never the original owner's.
    await expect(restoreAdvisorPlace(removed, run.otherOwner)).resolves.toMatchObject({ ownerId: run.otherOwner });
    await expect(takeAdvisorPlace(saved.id, run.owner)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("restores for the owner and keeps search working", async () => {
    const ids = await upsertPlaces([{ entityId: entity("taberna"), name: "Taberna da Rua", city: "Lisbon" }]);
    const placeId = ids[entity("taberna")]!;
    const saved = await saveAdvisorPlace(run.owner, { placeId, note: "Order the octopus" });
    const removed = await takeAdvisorPlace(saved.id, run.owner);

    const restored = await restoreAdvisorPlace(removed, run.owner);
    expect(restored).toMatchObject({ id: saved.id, note: "Order the octopus", placeName: "Taberna da Rua" });
    expect(restored.savedAt.toISOString()).toBe(saved.savedAt.toISOString());
    expect((await listAdvisorPlaces(run.owner, { q: "octopus" })).map((p) => p.id)).toEqual([saved.id]);

    // Undo twice is harmless.
    await expect(restoreAdvisorPlace(removed, run.owner)).resolves.toMatchObject({ id: saved.id });
  });
});
