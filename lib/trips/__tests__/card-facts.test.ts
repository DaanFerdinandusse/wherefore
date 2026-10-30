import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient } from "@/lib/clients";
import type { TripPlaceCard } from "@/lib/contracts";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { upsertPlaces } from "@/lib/places";
import { createTrip, listTripPlaceCards, upsertTripPlaces } from "@/lib/trips";

// The choice facts as the card query reads them: the description in the
// provider's order and only the practical tag families, in SQL, so a card
// does not pull every tag and every description of a place.

const run = testRun();
const entity = (key: string) => `${run.entityPrefix}${key}`;
const dietary = "urn:tag:dietary_option:qloo";

describe.skipIf(!hasDatabase)("card facts from the card query", () => {
  let cards: Map<string, TripPlaceCard>;

  beforeAll(async () => {
    const client = await createClient({ name: "Ana Ruiz" }, run.owner);
    const { trip } = await createTrip(run.owner, {
      clientId: client.id,
      destination: LISBON,
      datesMode: "unset",
      adults: 1,
      children: 0,
      travelers: [],
    });
    const placeIds = await upsertPlaces([
      {
        entityId: entity("full"),
        name: "Full",
        description: "The short one.",
        rating: 4.6,
        properties: { short_description: "The short one.", overall_description: "The long one." },
        tags: [
          { tagId: `${dietary}:vegan`, name: "Vegan", type: dietary },
          { tagId: "urn:tag:noise_level:qloo:quiet", name: "Quiet", type: "urn:tag:noise_level:qloo" },
          { tagId: "urn:tag:ambience:qloo:cozy", name: "Cozy", type: "urn:tag:ambience:qloo" },
        ],
      },
      {
        entityId: entity("order"),
        name: "Order",
        // A blank field and a field that is not text are no description.
        properties: { short_description: "  ", description: ["a", "list"], overall_description: "The long one." },
      },
      { entityId: entity("column"), name: "Column", description: "Only the column." },
      { entityId: entity("bare"), name: "Bare" },
    ]);
    await upsertTripPlaces(
      trip.id,
      Object.values(placeIds).map((placeId) => ({ placeId, source: "ask" as const, category: "eat" as const })),
      run.owner,
    );
    const rows = await listTripPlaceCards(trip.id, run.owner);
    cards = new Map(rows.map((card) => [card.name, card]));
  });

  afterAll(() => cleanup(run));

  it("reads the rating, the first description and only the practical tags", () => {
    expect(cards.get("Full")).toMatchObject({
      rating: 4.6,
      about: "The short one.",
      practical: { dietary: ["Vegan"], noise: ["Quiet"] },
    });
    expect(JSON.stringify(cards.get("Full"))).not.toContain("Cozy");
  });

  it("walks the description order past a blank field and one that is not text", () => {
    expect(cards.get("Order")?.about).toBe("The long one.");
    expect(cards.get("Column")?.about).toBe("Only the column.");
  });

  it("leaves every unknown fact off the card", () => {
    const bare = cards.get("Bare");
    expect(bare).toBeDefined();
    for (const key of ["rating", "about", "practical"]) expect(bare).not.toHaveProperty(key);
  });
});
