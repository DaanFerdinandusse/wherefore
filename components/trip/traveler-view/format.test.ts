import { describe, expect, it } from "vitest";

import type { SharedTripPlace, SharedTripSlot, SharedTripView } from "@/lib/contracts";

import {
  bandHeading,
  becauseLine,
  countOf,
  dateRangeLabel,
  dayLayouts,
  dayRoute,
  dayTitle,
  dishList,
  favoritesBehind,
  heroImage,
  heroIntro,
  joinNames,
  nightsOf,
  pageReasons,
  photoFrames,
  reasonLine,
  rowFrames,
  shareDescription,
  slotLine,
  splitStays,
  stayFacts,
  tagPhrase,
  withoutHero,
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

describe("reasonLine", () => {
  it("names the top favorite and two shared tags", () => {
    expect(reasonLine(place())).toEqual({
      favorite: "Via Carota",
      text: "Because you love Via Carota: the same seafood, lively feel.",
    });
  });

  it("stops at the favorite without tags", () => {
    expect(reasonLine(place({ sharedTags: [] }))?.text).toBe("Because you love Via Carota.");
  });

  it("keeps the capital of peoples and places in tags", () => {
    expect(reasonLine(place({ sharedTags: ["Italian", "Natural Wine"] }))?.text).toBe(
      "Because you love Via Carota: the same Italian, natural wine feel.",
    );
    expect(tagPhrase("Cozy")).toBe("cozy");
  });

  it("stops at an artist or film: a place has no feel in common with a band", () => {
    expect(reasonLine(place({ because: [{ name: "Khruangbin", share: 60, media: true }, { name: "Lilia", share: 40 }] }))?.text).toBe(
      "Because you love Khruangbin.",
    );
  });

  it("is null without a named favorite, so nothing is invented", () => {
    expect(reasonLine(place({ because: [] }))).toBeNull();
    expect(reasonLine(place({ because: [{ name: "Other favorites", share: 100 }] }))).toBeNull();
    expect(reasonLine(place({ because: [{ name: "Your places", share: 100 }] }))).toBeNull();
    expect(reasonLine(place({ because: [{ name: "This trip's picks", share: 100 }] }))).toBeNull();
  });
});

describe("pageReasons", () => {
  it("spreads strong drivers over the page and keeps weak ones out", () => {
    const a = place({ because: [{ name: "Clamato", share: 40 }, { name: "Septime", share: 35 }, { name: "Ten Belles", share: 10 }] });
    const b = place({ name: "B", because: [{ name: "Clamato", share: 40 }, { name: "Septime", share: 35 }] });
    const c = place({ name: "C", because: [{ name: "Clamato", share: 80 }, { name: "Septime", share: 20 }] });
    const d = place({ name: "D", because: [] });
    const reasons = pageReasons([a, b, c, d]);
    expect([a, b, c, d].map((p) => reasons.get(p)?.favorite ?? null)).toEqual(["Clamato", "Septime", "Clamato", null]);
  });
});

describe("becauseLine", () => {
  it("names the top two favorites by share", () => {
    expect(becauseLine(place().because)).toBe("Because you love Via Carota and Lilia");
    expect(becauseLine([])).toBeNull();
  });
});

describe("dates", () => {
  it("writes ranges plainly", () => {
    expect(dateRangeLabel("2026-11-12", "2026-11-16")).toBe("12 to 16 November");
    expect(dateRangeLabel("2026-11-28", "2026-12-02")).toBe("28 November to 2 December");
    expect(dateRangeLabel("2026-12-30", "2027-01-03")).toBe("30 December 2026 to 3 January 2027");
    expect(dateRangeLabel("2026-11-12")).toBe("12 November");
    expect(dateRangeLabel()).toBeNull();
    expect(dateRangeLabel("not a date", "2026-11-12")).toBeNull();
  });

  it("titles a day by weekday with the date and the route next to it", () => {
    const slots = [
      slot({ place: place({ neighborhood: "Príncipe Real" }) }),
      slot({ place: place({ neighborhood: undefined }) }),
      slot({ place: undefined, advisorNote: "Rest" }),
      slot({ place: place({ neighborhood: "Santos" }) }),
    ];
    expect(dayTitle({ day: 1, date: "2027-05-14", slots })).toEqual({
      title: "Friday",
      detail: "14 May · Príncipe Real to Santos",
    });
    expect(dayTitle({ day: 3, slots: [] })).toEqual({ title: "Day 3", detail: null });
    expect(dayRoute([slot(), slot()])).toBe("Roma Norte");
  });

  it("counts nights only with both dates", () => {
    expect(nightsOf("2026-11-12", "2026-11-16")).toBe(4);
    expect(nightsOf("2026-11-12")).toBeNull();
    expect(nightsOf("2026-11-16", "2026-11-12")).toBeNull();
  });
});

describe("slots and stays", () => {
  it("writes the slot line with the neighborhood when known", () => {
    expect(slotLine(slot({ slot: "dinner" }))).toBe("Dinner · Roma Norte");
    expect(slotLine(slot({ slot: "night", place: place({ neighborhood: undefined }) }))).toBe("Night");
  });

  it("takes stays out of the days once per place and hides days left empty", () => {
    const hotel = place({ name: "Valverde", category: "stay" });
    const { days, stays } = splitStays({
      days: [
        { day: 1, slots: [slot(), slot({ slot: "stay", place: hotel, advisorNote: "Garden side" })] },
        { day: 2, slots: [slot({ slot: "stay", place: hotel })] },
        { day: 3, slots: [slot({ slot: "stay", place: undefined, advisorNote: "Check out by noon" })] },
      ],
    });
    expect(days.map((d) => [d.day, d.slots.length])).toEqual([
      [1, 1],
      [3, 1],
    ]);
    expect(stays).toEqual([{ place: hotel, advisorNote: "Garden side" }]);
  });

  it("states a stay's nights and class only when known", () => {
    expect(stayFacts({ hotelClass: 5 }, 4)).toBe("Four nights · 5-star hotel");
    expect(stayFacts({}, 1)).toBe("One night");
    expect(stayFacts({}, null)).toBeNull();
  });

  it("lists dishes for the order chip", () => {
    expect(dishList(["Oysters", "Grilled octopus"])).toBe("oysters, grilled octopus");
  });
});

describe("layouts", () => {
  it("sets every second day of two or three places as a row", () => {
    const day = (n: number, count: number) => ({ day: n, slots: Array.from({ length: count }, () => slot()) });
    expect(dayLayouts([day(1, 3), day(2, 3), day(3, 2), day(4, 4), day(5, 1), day(6, 1)])).toEqual([
      "stack",
      "row",
      "stack",
      "stack",
      "stack",
      "stack",
    ]);
  });

  it("gives photos one height on wide screens and rotates pairs", () => {
    const three = photoFrames(["a", "b", "c", "d"], 0);
    expect(three.map((f) => [f.src, f.ratio, f.grow])).toEqual([
      ["a", "3 / 2", 1.5],
      ["b", "4 / 5", 0.8],
      ["c", "1 / 1", 1],
    ]);
    expect(three.map((f) => f.mobileRatio)).toEqual(["4 / 3", "1 / 1", "1 / 1"]);
    expect(photoFrames(["a", "b"], 0).map((f) => f.ratio)).toEqual(["4 / 3", "3 / 2"]);
    expect(photoFrames(["a", "b"], 1).map((f) => f.ratio)).toEqual(["1 / 1", "3 / 2"]);
    expect(photoFrames(["a"], 5).map((f) => f.ratio)).toEqual(["2 / 1"]);
    expect(photoFrames([], 0)).toEqual([]);
    expect(rowFrames(2).map((f) => f.ratio)).toEqual(["1 / 1", "3 / 4"]);
  });
});

describe("hero", () => {
  it("takes the first place with a spare photo, else the last photo", () => {
    const v = view();
    expect(heroImage(v)).toEqual({ src: "https://images.qloo.com/i/contramar.jpg", alt: "Lardo" });
    v.days[0]!.slots[1] = slot({ place: place({ name: "Rosetta", images: ["r1", "r2"] }) });
    expect(heroImage(v)).toEqual({ src: "r1", alt: "Rosetta" });
    expect(heroImage({ days: [] })).toBeNull();
    expect(withoutHero(["r1", "r2"], "r1")).toEqual(["r2"]);
    expect(withoutHero(["r1"], "r1")).toEqual(["r1"]);
  });

  it("writes the intro from counts and the favorites behind the picks", () => {
    expect(heroIntro(view())).toBe("Two days and three places, matched to what you already love: Via Carota, Lilia and Attaboy.");
    const plain = view({ days: [{ day: 1, slots: [slot({ place: place({ because: [] }) })] }] });
    expect(heroIntro(plain)).toBe("One day and one place, picked for you by Daan.");
    expect(heroIntro({ ...plain, advisorName: null })).toBe("One day and one place, picked for you.");
    expect(heroIntro(view({ days: [] }))).toBeNull();
    expect(countOf(14, "place", "places", false)).toBe("14 places");
  });

  it("prefers the server's favorites with photos, else sums the drivers", () => {
    expect(favoritesBehind(view()).map((f) => f.name)).toEqual(["Via Carota", "Lilia", "Attaboy"]);
    expect(favoritesBehind(view({ favorites: [{ name: "Lilia", imageUrl: "l.jpg" }] }))).toEqual([
      { name: "Lilia", imageUrl: "l.jpg" },
    ]);
  });

  it("claims every place is matched only when it is true", () => {
    expect(bandHeading(view())).toBe("Every place here is matched to one you already love.");
    const mixed = view();
    mixed.days[1]!.slots[0] = slot({ place: place({ because: [{ name: "Your places", share: 100 }] }) });
    expect(bandHeading(mixed)).toBe("Matched to the places you already love.");
  });

  it("joins names and describes the link for previews", () => {
    expect(joinNames(["Via Carota", "Lilia", "Attaboy"])).toBe("Via Carota, Lilia and Attaboy");
    expect(shareDescription(view())).toBe(
      "Daan planned your Mexico City days, 12 to 16 November, from the places you already love.",
    );
  });
});
