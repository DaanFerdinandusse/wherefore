import { describe, expect, it } from "vitest";

import { dayDate, firstName, type SharedSlotRow, toSharedTripView } from "../share";

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
              },
            },
          ],
        },
      ],
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
