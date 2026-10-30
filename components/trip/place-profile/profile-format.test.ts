import { describe, expect, it } from "vitest";

import type { ItinerarySlot } from "@/lib/contracts";

import {
  directionsUrl,
  googleHoursRows,
  hoursRowLabel,
  namedDrivers,
  isSlotTaken,
  nextFreeSlot,
  openState,
  parseRanges,
  plainHours,
  priceSigns,
  shortAddress,
  tripDays,
  whySentence,
} from "./profile-format";

const slot = (day: number, name: ItinerarySlot["slot"], tripPlaceId?: string): ItinerarySlot => ({
  id: `${day}-${name}`,
  day,
  slot: name,
  tripPlaceId,
  note: "",
  position: 0,
});

describe("tripDays", () => {
  it("counts the days from the dates and labels them", () => {
    const days = tripDays({ startDate: "2026-11-12", endDate: "2026-11-16" }, []);
    expect(days).toHaveLength(5);
    expect(days[1]).toEqual({ day: 2, date: "2026-11-13", label: "Day 2 · Fri 13 Nov" });
  });

  it("starts with three days without dates, more when slots use them", () => {
    expect(tripDays({}, []).map((d) => d.label)).toEqual(["Day 1", "Day 2", "Day 3"]);
    expect(tripDays({}, [slot(5, "lunch")])).toHaveLength(5);
  });
});

describe("nextFreeSlot", () => {
  const days = tripDays({ startDate: "2026-11-12", endDate: "2026-11-14" }, []);

  it("takes the first free slot that suits the category", () => {
    expect(nextFreeSlot("eat", days, [slot(1, "lunch", "a"), slot(1, "dinner", "b")])).toEqual({ day: 2, slot: "lunch" });
    expect(nextFreeSlot("drink", days, [])).toEqual({ day: 1, slot: "night" });
    expect(nextFreeSlot("coffee", days, [slot(1, "breakfast", "a")])).toEqual({ day: 1, slot: "morning" });
  });

  it("an empty slot row does not count as taken", () => {
    expect(nextFreeSlot("eat", days, [slot(1, "lunch")])).toEqual({ day: 1, slot: "lunch" });
  });

  it("falls back to any free slot, then to day 1", () => {
    const full = days.flatMap((d) => [slot(d.day, "lunch", "x"), slot(d.day, "dinner", "y")]);
    expect(nextFreeSlot("eat", days, full)).toEqual({ day: 1, slot: "breakfast" });
    const packed = days.flatMap((d) =>
      (["breakfast", "morning", "lunch", "afternoon", "dinner", "night"] as const).map((s) => slot(d.day, s, "z")),
    );
    expect(nextFreeSlot("eat", days, packed)).toEqual({ day: 1, slot: "lunch" });
    expect(nextFreeSlot("see", days, packed)).toEqual({ day: 1, slot: "morning" });
  });

  it("a taken meal says so, an open slot never does", () => {
    const slots = [slot(1, "lunch", "a"), slot(1, "afternoon", "b")];
    expect(isSlotTaken({ day: 1, slot: "lunch" }, slots)).toBe(true);
    expect(isSlotTaken({ day: 1, slot: "afternoon" }, slots)).toBe(false);
  });
});

describe("labels", () => {
  it("price signs and the street part of an address", () => {
    expect(priceSigns(3)).toBe("$$$");
    expect(priceSigns(null)).toBeNull();
    expect(priceSigns(7)).toBeNull();
    expect(shortAddress("Calle de Durango 200, Roma Norte, CDMX")).toBe("Calle de Durango 200");
  });

  it("directions link with the Google place id", () => {
    expect(directionsUrl("Contramar", "ChIJez8vvy__0YURP0rx5WhEig4")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Contramar&query_place_id=ChIJez8vvy__0YURP0rx5WhEig4",
    );
    expect(directionsUrl("Bar Leo", null, "Rua X 1")).toBe("https://www.google.com/maps/search/?api=1&query=Bar+Leo%2C+Rua+X+1");
  });
});

describe("drivers", () => {
  const because = [
    { entityId: "a", name: "Via Carota", share: 52 },
    { entityId: "b", name: "Lilia", share: 34 },
    { entityId: "other", name: "Other favorites", share: 14 },
  ];

  it("never treats Other favorites as a favorite", () => {
    expect(namedDrivers(because).map((d) => d.name)).toEqual(["Via Carota", "Lilia"]);
    expect(whySentence([{ entityId: "other", name: "Other favorites", share: 100 }])).toBeNull();
  });

  it("names the two biggest drivers and their city when they share one", () => {
    const cities = new Map([
      ["a", "New York"],
      ["b", "New York"],
    ]);
    expect(whySentence(because, cities)).toBe("People who love Via Carota and Lilia in New York also love this place.");
    expect(whySentence(because, new Map([["a", "New York"], ["b", "London"]]))).toBe(
      "People who love Via Carota and Lilia also love this place.",
    );
  });
});

describe("hours", () => {
  const google = [
    "Monday: 1:00 – 11:00 PM",
    "Tuesday: Closed",
    "Wednesday: 9:00 AM – 2:00 PM, 6:30 – 11:30 PM",
    "Thursday: 1:00 – 11:00 PM",
    "Friday: 1:00 PM – 1:00 AM",
    "Saturday: Open 24 hours",
    "Sunday: Closed",
  ];

  it("writes Google's hours the app's way", () => {
    expect(plainHours("1:00 – 11:00 PM")).toBe("1 to 11 pm");
    expect(plainHours("12:30 PM – 6:30 PM")).toBe("12:30 pm to 6:30 pm");
  });

  it("marks the trip days", () => {
    const days = tripDays({ startDate: "2026-11-12", endDate: "2026-11-16" }, []);
    const rows = googleHoursRows(google, days);
    expect(rows).toHaveLength(7);
    expect(rows[3]).toMatchObject({ label: "Thu", tripDays: [1] });
    expect(hoursRowLabel(rows[4]!)).toBe("Fri (Day 2)");
    expect(hoursRowLabel(rows[1]!)).toBe("Tue");
  });

  it("parses ranges, including one past midnight", () => {
    expect(parseRanges("1 to 11 pm")).toEqual([{ open: 13 * 60, close: 23 * 60, closeLabel: "11 pm" }]);
    expect(parseRanges("1 pm to 1 am")[0]).toMatchObject({ open: 13 * 60, close: 25 * 60 });
    expect(parseRanges("9 am to 2 pm, 6:30 to 11:30 pm")).toHaveLength(2);
  });

  it("open state from openNow, the closing time only with the place's UTC offset", () => {
    // 2026-11-12 is a Thursday; 20:00 UTC is 14:00 at UTC-6.
    const now = new Date("2026-11-12T20:00:00Z");
    const offset = -360;
    expect(openState({ openNow: true, openingHours: google, utcOffsetMinutes: offset }, now)).toEqual({ open: true, text: "Open until 11 pm" });
    expect(openState({ openNow: false, openingHours: google, utcOffsetMinutes: offset }, now)).toEqual({ open: false, text: "Closed now" });
    expect(openState({ openingHours: google }, now)).toBeNull();
    // Wednesday 20:00 local: the evening range.
    const wed = new Date("2026-11-12T02:00:00Z");
    expect(openState({ openNow: true, openingHours: google, utcOffsetMinutes: offset }, wed)).toEqual({ open: true, text: "Open until 11:30 pm" });
    // No offset: Google's own state, no guessed closing time.
    expect(openState({ openNow: true, openingHours: google }, now)).toEqual({ open: true, text: "Open now" });
    expect(openState({ openNow: false, openingHours: google }, now)).toEqual({ open: false, text: "Closed now" });
  });
});
