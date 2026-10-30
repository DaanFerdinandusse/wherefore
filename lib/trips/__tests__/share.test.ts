import { describe, expect, it } from "vitest";

import {
  dayDate,
  dishesOf,
  favoritesOf,
  firstName,
  hotelClassOf,
  imageKey,
  imagesOf,
  keywordsOf,
  type SharedSlotRow,
  toSharedTripView,
} from "../share";

const trip = {
  title: "Lisbon for Ana",
  destinationName: "Lisbon",
  startDate: "2026-05-14",
  endDate: "2026-05-18",
  clientName: "Ana Ruiz",
  advisorName: "Daan",
};

const uva: NonNullable<SharedSlotRow["place"]> = {
  name: "Senhor Uva",
  category: "drink",
  imageUrl: "https://example.test/uva.jpg",
  neighborhood: "Estrela",
  explainability: [
    { entityId: "e-via-carota", name: "Via Carota", share: 60 },
    { entityId: "e-lilia", name: "Lilia", share: 40 },
  ],
  sharedTags: [{ tagId: "t1", name: "natural wine", type: "cuisine", score: 0.9 }],
  reason: " Natural wine like Via Carota. ",
};

const slot = (overrides: Partial<SharedSlotRow>): SharedSlotRow => ({
  day: 1,
  date: null,
  slot: "dinner",
  position: 0,
  note: "",
  noteForTraveler: false,
  place: null,
  ...overrides,
});

describe("toSharedTripView", () => {
  it("keeps only traveler-facing fields", () => {
    const view = toSharedTripView(trip, [
      slot({ day: 2, slot: "night", place: uva, note: "Private: client is picky", noteForTraveler: false }),
    ]);
    expect(view).toEqual({
      title: "Lisbon for Ana",
      destinationName: "Lisbon",
      startDate: "2026-05-14",
      endDate: "2026-05-18",
      preparedFor: "Ana",
      advisorName: "Daan",
      days: [
        {
          day: 2,
          date: "2026-05-15",
          slots: [
            {
              slot: "night",
              position: 0,
              place: {
                name: "Senhor Uva",
                category: "drink",
                imageUrl: "https://example.test/uva.jpg",
                neighborhood: "Estrela",
                because: [
                  { name: "Via Carota", share: 60 },
                  { name: "Lilia", share: 40 },
                ],
                sharedTags: ["natural wine"],
                reason: "Natural wine like Via Carota.",
                images: ["https://example.test/uva.jpg"],
              },
            },
          ],
        },
      ],
      favorites: [{ name: "Via Carota" }, { name: "Lilia" }],
    });
    // No entity ids, tag ids or private notes anywhere in the payload.
    const json = JSON.stringify(view);
    for (const secret of ["e-via-carota", "t1", "Private"]) expect(json).not.toContain(secret);
  });

  it("shows a slot note only when it is marked for the traveler", () => {
    const view = toSharedTripView(trip, [
      slot({ slot: "lunch", place: uva, note: "Ask for the counter", noteForTraveler: true }),
      slot({ slot: "afternoon", note: "Walk along the river", noteForTraveler: true }),
      slot({ slot: "morning", note: "Advisor only", noteForTraveler: false }),
      slot({ slot: "night", note: "   ", noteForTraveler: true }),
    ]);
    expect(view.days).toHaveLength(1);
    expect(view.days[0]!.slots.map((s) => [s.slot, s.advisorNote, s.place?.name])).toEqual([
      ["lunch", "Ask for the counter", "Senhor Uva"],
      ["afternoon", "Walk along the river", undefined],
    ]);
  });

  it("orders days and slots and leaves empty days out", () => {
    const view = toSharedTripView({ ...trip, startDate: null, endDate: null }, [
      slot({ day: 3, slot: "dinner", place: uva }),
      slot({ day: 1, slot: "night", place: uva, position: 1 }),
      slot({ day: 1, slot: "night", place: uva, position: 0 }),
      slot({ day: 1, slot: "morning", place: uva, date: "2026-06-01" }),
      slot({ day: 2, slot: "lunch" }),
    ]);
    expect(view.startDate).toBeUndefined();
    expect(view.days.map((d) => [d.day, d.date])).toEqual([
      [1, "2026-06-01"],
      [3, undefined],
    ]);
    expect(view.days[0]!.slots.map((s) => `${s.slot}:${s.position}`)).toEqual(["morning:0", "night:0", "night:1"]);
  });
});

describe("share helpers", () => {
  it("takes the first name and counts dates from the start", () => {
    expect(firstName("  Ana   Ruiz ")).toBe("Ana");
    expect(dayDate("2026-05-14", 1)).toBe("2026-05-14");
    expect(dayDate("2026-05-31", 2)).toBe("2026-06-01");
    expect(dayDate(null, 2)).toBeUndefined();
  });
});

describe("the other favorites bucket", () => {
  it("never reaches the traveler as a favorite", () => {
    const place = {
      ...uva,
      explainability: [
        { entityId: "e-via-carota", name: "Via Carota", share: 40 },
        { entityId: "other", name: "Other favorites", share: 45 },
        { entityId: "e-lilia", name: "Lilia", share: 15 },
      ],
    };
    const view = toSharedTripView(trip, [slot({ place })]);
    expect(view.days[0].slots[0].place?.because).toEqual([
      { name: "Via Carota", share: 40 },
      { name: "Lilia", share: 15 },
    ]);
  });
});

describe("agent notes", () => {
  it("never reach the traveler, even with the traveler flag set", () => {
    const view = toSharedTripView(trip, [
      slot({ place: uva, note: "Book the 8 pm sitting", noteForTraveler: true, noteSource: "agent" }),
      slot({ slot: "lunch", place: uva, note: "Ask for the terrace", noteForTraveler: true, noteSource: "advisor" }),
    ]);
    const notes = view.days.flatMap((d) => d.slots.map((s) => s.advisorNote));
    expect(notes).toEqual(["Ask for the terrace", undefined]);
  });
});

describe("plain drivers", () => {
  it("leaves Your places and Other favorites out of the because names", () => {
    const view = toSharedTripView(trip, [
      slot({
        place: {
          ...uva,
          explainability: [
            { entityId: "e-via-carota", name: "Via Carota", share: 50 },
            { entityId: "advisor", name: "Your places", share: 30 },
            { entityId: "other", name: "Other favorites", share: 20 },
          ],
        },
      }),
    ]);
    expect(view.days[0]?.slots[0]?.place?.because).toEqual([{ name: "Via Carota", share: 50 }]);
  });
});

describe("place facts from the provider properties", () => {
  it("keeps review keywords by count, without generic words, repeats or the place's own name", () => {
    const raw = [
      { name: "chef", count: 40 },
      { name: "natural wine", count: 13 },
      { name: "Senhor Uva", count: 30 },
      { name: "petiscos", count: 20 },
      { name: "Natural Wine", count: 2 },
      { name: 42 },
      "not an object",
      { name: "terrace", count: 9 },
      { name: "orange wine", count: 8 },
      { name: "staff", count: 7 },
      { name: "vinyl", count: 6 },
    ];
    expect(keywordsOf(raw, "Senhor Uva")).toEqual(["Petiscos", "Natural wine", "Terrace", "Orange wine"]);
    expect(keywordsOf(null, "Senhor Uva")).toEqual([]);
    expect(keywordsOf({ name: "x" }, "Senhor Uva")).toEqual([]);
  });

  it("reads specialty dishes as objects or strings, in sentence case", () => {
    const raw = [
      { id: "urn:tag:specialty_dish:place:tostadas_atun", name: "Tostadas De Atun", weight: 1 },
      "Fig Tart",
      { name: "tostadas de atun" },
      { weight: 1 },
      { name: "Whole Fish" },
      { name: "Le Steak" },
    ];
    expect(dishesOf(raw)).toEqual(["Tostadas de atun", "Fig tart", "Whole fish"]);
    expect(dishesOf(undefined)).toEqual([]);
  });

  it("takes a hotel class from 1 to 5 only", () => {
    expect(hotelClassOf(4)).toBe(4);
    expect(hotelClassOf("5")).toBe(5);
    expect(hotelClassOf(4.5)).toBe(4);
    expect(hotelClassOf(0)).toBeUndefined();
    expect(hotelClassOf("five")).toBeUndefined();
    expect(hotelClassOf(null)).toBeUndefined();
  });

  it("keeps a stay's hotel class and drops it on other places", () => {
    const view = toSharedTripView(trip, [
      slot({ slot: "stay", place: { ...uva, category: "stay", hotelClass: "4" } }),
      slot({ slot: "dinner", place: { ...uva, name: "Uva again", hotelClass: 4 } }),
    ]);
    // Dinner comes before the stay in a day.
    expect(view.days[0]!.slots.map((s) => [s.place?.name, s.place?.hotelClass])).toEqual([
      ["Uva again", undefined],
      ["Senhor Uva", 4],
    ]);
  });
});

describe("photos", () => {
  const a = "https://images.qloo.com/i/DA9D8A45-C042-4B22-AD57-14E1520B4D2E-3Dzzkd-420x-outside.jpg";
  const aAuto = "https://images.qloo.com/i/DA9D8A45-C042-4B22-AD57-14E1520B4D2E-420x-auto.jpg";
  const b = "https://images.qloo.com/i/4FE659FB-6F70-4592-B36D-374219298F1F-420x-auto.jpg";

  it("treats crops of one provider image as one photo", () => {
    expect(imageKey(a)).toBe(imageKey(aAuto));
    expect(imageKey(a)).not.toBe(imageKey(b));
    expect(imageKey("https://example.test/x.jpg")).toBe("https://example.test/x.jpg");
  });

  it("keeps up to three distinct public photos and drops the session-only proxy", () => {
    expect(
      imagesOf({
        images: [a, aAuto, "/api/places/photo?ref=1", b, "https://example.test/3.jpg", "https://example.test/4.jpg"],
        imageUrl: a,
      }),
    ).toEqual([a, b, "https://example.test/3.jpg"]);
    expect(imagesOf({ imageUrl: null })).toEqual([]);
  });
});

describe("favorites behind the picks", () => {
  it("ranks the drivers of the shown places by total share, with photos by id, else by name", () => {
    const rows = [
      slot({ place: uva }),
      slot({
        slot: "lunch",
        place: {
          ...uva,
          explainability: [
            { entityId: "e-lilia", name: "Lilia", share: 70 },
            { entityId: "e-khruangbin", name: "Khruangbin", share: 30 },
          ],
        },
      }),
      slot({ slot: "morning", note: "Rest", noteForTraveler: true }),
    ];
    const known = [
      { entityId: "e-lilia", name: "Lilia (Brooklyn)", imageUrl: "https://example.test/lilia.jpg" },
      { entityId: null, name: "Khruangbin", imageUrl: "https://example.test/kb.jpg" },
      { entityId: "e-attaboy", name: "Attaboy", imageUrl: "https://example.test/attaboy.jpg" },
      { entityId: "e-via-carota", name: "Via Carota", imageUrl: "/api/places/photo?ref=2" },
    ];
    expect(favoritesOf(rows, known)).toEqual([
      { name: "Lilia", imageUrl: "https://example.test/lilia.jpg" },
      { name: "Via Carota" },
      { name: "Khruangbin", imageUrl: "https://example.test/kb.jpg" },
    ]);
  });

  it("is left out of the view without drivers", () => {
    const view = toSharedTripView(trip, [slot({ place: { ...uva, explainability: [] } })]);
    expect(view.favorites).toBeUndefined();
  });
});

describe("advisor email", () => {
  it("reaches the view only when it is a valid address", () => {
    expect(toSharedTripView({ ...trip, advisorEmail: " sofia@atelier.test " }, []).advisorEmail).toBe("sofia@atelier.test");
    expect(toSharedTripView({ ...trip, advisorEmail: "not an email" }, []).advisorEmail).toBeUndefined();
    expect(toSharedTripView({ ...trip, advisorEmail: null }, []).advisorEmail).toBeUndefined();
  });
});
