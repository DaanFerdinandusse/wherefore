import { afterAll, describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/auth/errors";
import { cleanup, hasDatabase, testRun } from "@/lib/db/__tests__/fixtures";
import {
  advisorCities,
  getPlacesByEntityIds,
  listAdvisorPlaces,
  removeAdvisorPlace,
  saveAdvisorPlace,
  updateAdvisorPlaceNote,
  upsertPlaces,
} from "@/lib/places";

const run = testRun();
const entity = (key: string) => `${run.entityPrefix}${key}`;

describe.skipIf(!hasDatabase)("places", () => {
  afterAll(() => cleanup(run));

  it("upserts by entity id and keeps known fields the refresh leaves out", async () => {
    const first = await upsertPlaces([
      { entityId: entity("a"), name: "Taberna", city: "Lisbon", description: "Small plates" },
      { entityId: entity("a"), name: "Taberna da Rua", neighborhood: "Alfama" },
    ]);
    const id = first[entity("a")];
    expect(id).toBeDefined();

    const again = await upsertPlaces([{ entityId: entity("a"), name: "Taberna da Rua das Flores" }]);
    expect(again[entity("a")]).toBe(id);
    const [place] = await getPlacesByEntityIds([entity("a")]);
    expect(place).toMatchObject({
      name: "Taberna da Rua das Flores",
      city: "Lisbon",
      neighborhood: "Alfama",
      description: "Small plates",
    });
  });

  it("saves, searches, edits and removes an advisor place", async () => {
    const ids = await upsertPlaces([{ entityId: entity("b"), name: "Senhor Uva", city: "Lisbon" }]);
    const saved = await saveAdvisorPlace(run.owner, { placeId: ids[entity("b")]!, note: "Natural wine bar" });
    expect(saved).toMatchObject({ city: "Lisbon", placeName: "Senhor Uva", search: "Senhor Uva Lisbon Natural wine bar" });

    // Saving again updates rather than duplicating.
    const resaved = await saveAdvisorPlace(run.owner, { placeId: ids[entity("b")]!, note: "Sit at the bar" });
    expect(resaved.id).toBe(saved.id);

    expect((await listAdvisorPlaces(run.owner, { q: "senor uva" })).map((p) => p.id)).toEqual([saved.id]);
    expect(await advisorCities(run.owner)).toEqual([{ city: "Lisbon", count: 1 }]);

    const edited = await updateAdvisorPlaceNote(saved.id, "Closed Sundays", run.owner);
    expect(edited.search).toBe("Senhor Uva Lisbon Closed Sundays");

    await expect(removeAdvisorPlace(saved.id, run.otherOwner)).rejects.toBeInstanceOf(NotFoundError);
    await removeAdvisorPlace(saved.id, run.owner);
    expect(await listAdvisorPlaces(run.owner)).toEqual([]);
  });
});
