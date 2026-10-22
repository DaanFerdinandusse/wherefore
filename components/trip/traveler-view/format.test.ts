import { describe, expect, it } from "vitest";

import type { SharedTripPlace, SharedTripSlot, SharedTripView } from "@/lib/contracts";

import {
  becauseLine,
  dateRangeLabel,
  dayHeading,
  dayNeighborhoods,
  favoritesBehind,
  groupDays,
  heroImage,
  heroSummary,
  joinNames,
  shareDescription,
  travelerDays,
} from "./format";

const place = (overrides: Partial<SharedTripPlace> = {}): SharedTripPlace => ({
  name: "Contramar",
  category: "eat",
  imageUrl: "https://images.qloo.com/i/contramar.jpg",
  neighborhood: "Roma Norte",
  because: [
    { name: "Lilia", share: 34 },
    { name: "Via Carota", share: 52 },
    { name: "Attaboy", share: 14 },
  ],
  sharedTags: ["Seafood", "Lively"],
  ...overrides,
});

const slot = (overrides: Partial<SharedTripSlot> = {}): SharedTripSlot => ({
  slot: "lunch",
  position: 0,
  place: place(),
  ...overrides,
});

const view = (overrides: Partial<SharedTripView> = {}): SharedTripView => ({
  title: "Mexico City for Marcus",
  destinationName: "Mexico City",
  startDate: "2026-11-12",
  endDate: "2026-11-16",
  preparedFor: "Marcus",
  advisorName: "Daan",
  days: [
    { day: 1, date: "2026-11-12", slots: [slot(), slot({ slot: "dinner", place: place({ name: "Rosetta" }) })] },
    { day: 2, date: "2026-11-13", slots: [slot({ place: place({ name: "Lardo", neighborhood: "Condesa" }) })] },
  ],
  ...overrides,
});

describe("becauseLine", () => {
  it("names the top two favorites by share", () => {
    expect(becauseLine(place().because)).toBe("Because you love Via Carota and Lilia");
  });

  it("names a single favorite on its own", () => {
    expect(becauseLine([{ name: "Devoción", share: 100 }])).toBe("Because you love Devoción");
  });

  it("is null without explainability, so nothing is invented", () => {
    expect(becauseLine([])).toBeNull();
    expect(becauseLine([{ name: "  ", share: 100 }])).toBeNull();
  });
});

describe("dateRangeLabel", () => {
  it("writes the month once within a month", () => {
    expect(dateRangeLabel("2026-11-12", "2026-11-16")).toBe("12 to 16 November");
  });

  it("writes both months across months", () => {
    expect(dateRangeLabel("2026-11-28", "2026-12-02")).toBe("28 November to 2 December");
  });

  it("adds years across years", () => {
    expect(dateRangeLabel("2026-12-30", "2027-01-03")).toBe("30 December 2026 to 3 January 2027");
  });

  it("handles a single day, a missing end and missing dates", () => {
    expect(dateRangeLabel("2026-11-12", "2026-11-12")).toBe("12 November");
    expect(dateRangeLabel("2026-11-12")).toBe("12 November");
    expect(dateRangeLabel()).toBeNull();
    expect(dateRangeLabel("not a date", "2026-11-12")).toBeNull();
  });
});

describe("dayHeading", () => {
  it("names the weekday and date", () => {
    expect(dayHeading({ day: 1, date: "2026-11-12" })).toBe("Thursday 12 November");
  });

  it("falls back to the day number without a date", () => {
    expect(dayHeading({ day: 3 })).toBe("Day 3");
  });
});

describe("travelerDays", () => {
  it("fills every trip day from the dates, empty days included", () => {
    const days = travelerDays(view());
    expect(days.map((d) => [d.day, d.date, d.slots.length])).toEqual([
      [1, "2026-11-12", 2],
      [2, "2026-11-13", 1],
      [3, "2026-11-14", 0],
      [4, "2026-11-15", 0],
      [5, "2026-11-16", 0],
    ]);
  });

  it("counts to the last planned day when there are no dates", () => {
    const days = travelerDays({ days: [{ day: 3, slots: [slot()] }] });
    expect(days.map((d) => [d.day, d.date, d.slots.length])).toEqual([
      [1, undefined, 0],
      [2, undefined, 0],
      [3, undefined, 1],
    ]);
  });

  it("keeps planned days past the end date", () => {
    const days = travelerDays(view({ endDate: "2026-11-12" }));
    expect(days).toHaveLength(2);
  });
});

describe("groupDays", () => {
  it("keeps planned days apart and runs of free days together", () => {
    const groups = groupDays(
      travelerDays(view({ days: [{ day: 2, slots: [slot()] }, { day: 5, slots: [slot()] }] })),
    );
    expect(groups.map((g) => (g.kind === "planned" ? `p${g.day.day}` : `f${g.days.map((d) => d.day).join("")}`))).toEqual([
      "f1",
      "p2",
      "f34",
      "p5",
    ]);
  });
});

describe("dayNeighborhoods", () => {
  it("names the most frequent neighborhoods, up to two", () => {
    const slots = [
      slot({ place: place({ neighborhood: "Condesa" }) }),
      slot(),
      slot(),
      slot({ place: place({ neighborhood: "Juárez" }) }),
      slot({ place: undefined, advisorNote: "Rest" }),
    ];
    expect(dayNeighborhoods(slots)).toBe("Roma Norte and Condesa");
  });

  it("is null without neighborhoods", () => {
    expect(dayNeighborhoods([slot({ place: place({ neighborhood: undefined }) })])).toBeNull();
  });
});

describe("hero helpers", () => {
  it("takes the first place image in itinerary order", () => {
    const v = view();
    v.days[0].slots[0] = slot({ place: place({ imageUrl: undefined }) });
    expect(heroImage(v)).toEqual({ src: "https://images.qloo.com/i/contramar.jpg", alt: "Rosetta" });
    expect(heroImage({ days: [] })).toBeNull();
  });

  it("summarizes the count and the advisor", () => {
    expect(heroSummary(view())).toBe("Three places, picked for you by Daan.");
    expect(heroSummary(view({ advisorName: null, days: [{ day: 1, slots: [slot()] }] }))).toBe(
      "One place, picked for you.",
    );
  });

  it("ranks the favorites behind the picks by total share", () => {
    expect(favoritesBehind(view())).toEqual(["Via Carota", "Lilia", "Attaboy"]);
  });

  it("joins names in plain English", () => {
    expect(joinNames(["Via Carota"])).toBe("Via Carota");
    expect(joinNames(["Via Carota", "Lilia", "Attaboy"])).toBe("Via Carota, Lilia and Attaboy");
  });

  it("describes the link for previews", () => {
    expect(shareDescription(view())).toBe(
      "Daan planned your Mexico City days, 12 to 16 November, from the places you already love.",
    );
  });
});

describe("the other favorites bucket", () => {
  const because = [
    { name: "Other favorites", share: 70 },
    { name: "Via Carota", share: 20 },
    { name: "Lilia", share: 10 },
  ];

  it("is left out of the because line and the favorites behind the trip", () => {
    expect(becauseLine(because)).toBe("Because you love Via Carota and Lilia");
    expect(becauseLine([{ name: "Other favorites", share: 100 }])).toBeNull();
    const days: SharedTripView["days"] = [{ day: 1, slots: [{ slot: "dinner", position: 0, place: { ...place(), because } }] }];
    expect(favoritesBehind({ days })).toEqual(["Via Carota", "Lilia"]);
  });
});
