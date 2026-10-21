import { afterAll, describe, expect, it } from "vitest";

import { cleanup, hasDatabase, testRun } from "@/lib/db/__tests__/fixtures";
import { upsertPlaces } from "@/lib/places";
import { getGooglePlaceIdForPlace } from "@/lib/places/queries";

// The place profile's route resolves a card's placeId to the Google id with
// getGooglePlaceIdForPlace (lib/places/queries.ts).

const run = testRun();

describe("getGooglePlaceIdForPlace", () => {
  it("returns null for an id that is not a uuid, without a query", async () => {
    expect(await getGooglePlaceIdForPlace("ChIJh32rQULLHg0RkgF8wCakjIk")).toBeNull();
  });

  describe.skipIf(!hasDatabase)("against the database", () => {
    afterAll(() => cleanup(run));

    it("reads the stored Google id, and null when the row has none or does not exist", async () => {
      const ids = await upsertPlaces([
        { entityId: `${run.entityPrefix}g1`, name: "Feitoria", googlePlaceId: "ChIJh32rQULLHg0RkgF8wCakjIk" },
        { entityId: `${run.entityPrefix}g2`, name: "No listing" },
      ]);
      expect(await getGooglePlaceIdForPlace(ids[`${run.entityPrefix}g1`]!)).toBe("ChIJh32rQULLHg0RkgF8wCakjIk");
      expect(await getGooglePlaceIdForPlace(ids[`${run.entityPrefix}g2`]!)).toBeNull();
      expect(await getGooglePlaceIdForPlace("00000000-0000-4000-8000-000000000000")).toBeNull();
    });
  });
});
