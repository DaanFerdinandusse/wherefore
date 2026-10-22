import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient } from "@/lib/clients";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { saveAdvisorPlace, upsertPlaces } from "@/lib/places";
import { addAskPlaces, createAsk, createTrip, upsertTripPlaces } from "@/lib/trips";
import { loadTripPlaceProfile } from "@/lib/trips/profile-query";
import {
  aboutParagraphsOf,
  buildProfilePlace,
  featuresOf,
  formatClock,
  providerHoursOf,
  shortParagraphs,
} from "@/lib/trips/profile-types";

describe("profile place builder", () => {
  it("splits long descriptions into short paragraphs without repeating the short one", () => {
    expect(shortParagraphs("One. Two! Three? Four.")).toEqual(["One. Two!", "Three? Four."]);
    expect(
      aboutParagraphsOf(
        {
          ambience_description: "Calm room. Low light.",
          cuisine_description: "Short one.",
          unique_selling_points: "Known for clams.",
        },
        "Short one.",
      ),
    ).toEqual(["Calm room. Low light.", "Known for clams."]);
  });

  it("formats the provider hours, Monday first, closed days included", () => {
    expect(formatClock("T13:00:00")).toBe("1 pm");
    expect(formatClock("T12:30:00")).toBe("12:30 pm");
    expect(formatClock("T00:00:00")).toBe("12 am");
    expect(
      providerHoursOf({
        hours: {
          sunday: [{ opens: null, closes: null, closed: true }],
          monday: [
            { opens: "T09:00:00", closes: "T14:00:00", closed: false },
            { opens: "T18:30:00", closes: "T23:00:00", closed: false },
          ],
        },
      }),
    ).toEqual([
      { weekday: 1, text: "9 am to 2 pm, 6:30 pm to 11 pm" },
      { weekday: 7, text: "Closed" },
    ]);
  });

  it("picks practical feature chips from the tags, deduplicated and capped", () => {
    const tags = [
      { tagId: "a", name: "Seafood", type: "urn:tag:cuisine:qloo" },
      { tagId: "b", name: "Accepts reservations", type: "urn:tag:planning:place" },
      { tagId: "c", name: "Wheelchair accessible entrance", type: "urn:tag:accessibility:place" },
      { tagId: "d", name: "Accepts reservations", type: "urn:tag:service_options:place" },
    ];
    expect(featuresOf(tags)).toEqual(["Accepts reservations", "Wheelchair accessible entrance"]);
    expect(featuresOf(tags, 1)).toEqual(["Accepts reservations"]);
  });

  it("builds the place with its kind from the primary genre", () => {
    const place = buildProfilePlace({
      id: "p",
      entityId: "e",
      name: "Contramar",
      address: null,
      city: null,
      neighborhood: null,
      lat: null,
      lon: null,
      priceLevel: 3,
      rating: 4.6,
      description: "Fallback.",
      images: [{ url: "https://example.test/a.jpg" }, { url: "" }],
      tags: [{ tagId: "t", name: "Seafood restaurant", type: "urn:tag:category:place" }],
      properties: { primary_genre: { name: "Seafood restaurant" }, website: " https://x.test ", phone: "" },
      googlePlaceId: null,
    });
    expect(place).toMatchObject({
      kind: "Seafood restaurant",
      shortDescription: "Fallback.",
      website: "https://x.test",
      phone: null,
      images: [{ url: "https://example.test/a.jpg" }],
    });
  });
});

describe.skipIf(!hasDatabase)("loadTripPlaceProfile", () => {
  const run = testRun();
  const entity = (key: string) => `${run.entityPrefix}${key}`;
  let tripPlaceId = "";

  beforeAll(async () => {
    const client = await createClient({ name: "Ana Ruiz" }, run.owner);
    const placeIds = await upsertPlaces([
      { entityId: entity("fav"), name: "Via Carota", city: "New York", images: [{ url: "https://example.test/vc.jpg" }] },
      {
        entityId: entity("place"),
        name: "Senhor Uva",
        city: "Lisbon",
        images: [{ url: "https://example.test/uva.jpg" }],
        properties: { short_description: "Natural wine bar.", primary_genre: { name: "Wine bar" } },
        googlePlaceId: "ChIJtestplaceid0001",
      },
    ]);
    const placeId = placeIds[entity("place")]!;
    const { trip } = await createTrip(run.owner, {
      clientId: client.id,
      destination: LISBON,
      datesMode: "unset",
      adults: 1,
      children: 0,
      travelers: [],
    });
    const saved = await saveAdvisorPlace(run.owner, { placeId, note: "Sit at the bar." });
    const written = await upsertTripPlaces(
      trip.id,
      [
        {
          placeId,
          source: "seed",
          category: "drink",
          bestScore: 88,
          advisorPlaceId: saved.id,
          explainability: [
            { entityId: entity("fav"), name: "Via Carota", share: 70 },
            { entityId: "other", name: "Other favorites", share: 30 },
          ],
        },
      ],
      run.owner,
    );
    tripPlaceId = written[placeId]!;
    const ask = await createAsk(trip.id, { label: "Natural wine" }, run.owner);
    await addAskPlaces(ask.id, [{ tripPlaceId, rank: 0 }], run.owner);
  });

  afterAll(() => cleanup(run));

  it("returns the card, the place, the saved row, the asks and the named drivers", async () => {
    const profile = await loadTripPlaceProfile(tripPlaceId, run.owner);
    expect(profile?.card).toMatchObject({ name: "Senhor Uva", score: 88, yourPlace: { note: "Sit at the bar." } });
    expect(profile?.place).toMatchObject({ kind: "Wine bar", shortDescription: "Natural wine bar.", googlePlaceId: "ChIJtestplaceid0001" });
    expect(profile?.advisorPlace).toMatchObject({ note: "Sit at the bar.", inTrips: 1 });
    expect(profile?.asks.map((a) => a.label)).toEqual(["Natural wine"]);
    expect(profile?.drivers).toEqual([
      { entityId: entity("fav"), name: "Via Carota", imageUrl: "https://example.test/vc.jpg", city: "New York" },
    ]);
  });

  it("reads as null outside the owner's scope", async () => {
    expect(await loadTripPlaceProfile(tripPlaceId, run.otherOwner)).toBeNull();
    expect(await loadTripPlaceProfile("not-a-uuid", run.owner)).toBeNull();
  });
});
