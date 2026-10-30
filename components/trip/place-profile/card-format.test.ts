import { describe, expect, it } from "vitest";

import {
  highlightSegments,
  hoursOnDate,
  isInSlot,
  keywordBars,
  morePhotosLabel,
  openForSlot,
  pickLine,
  priceRangeLabel,
  reservationLine,
  reviewsNewestFirst,
  shortAuthor,
  shortDateLabel,
} from "./card-format";

const NARROW = String.fromCharCode(0x202f);
const EN_DASH = String.fromCharCode(0x2013);
const HOURS = [
  `Monday: Closed`,
  `Thursday: 12:00${NARROW}PM ${EN_DASH} 3:00${NARROW}PM, 7:00${NARROW}PM ${EN_DASH} 11:30${NARROW}PM`,
  `Friday: 7:00${NARROW}PM ${EN_DASH} 11:30${NARROW}PM`,
  `Saturday: 9:00${NARROW}AM ${EN_DASH} 2:00${NARROW}PM`,
];

describe("keywordBars", () => {
  it("keeps the five most mentioned, widths relative to the first", () => {
    const bars = keywordBars([
      { name: "Fresh fish", count: 188 },
      { name: "Oysters", count: 214 },
      { name: "Sushi", count: 41 },
      { name: "Live DJ", count: 58 },
      { name: "Market counter", count: 96 },
      { name: "Service", count: 12 },
    ]);
    expect(bars.map((b) => b.name)).toEqual(["Oysters", "Fresh fish", "Market counter", "Live DJ", "Sushi"]);
    expect(bars[0]).toEqual({ name: "Oysters", count: 214, width: 100, top: true });
    expect(bars[4]?.width).toBe(19);
    expect(keywordBars(undefined)).toEqual([]);
  });
});

describe("hours for the slot", () => {
  it("reads the slot's weekday from Google's hours", () => {
    expect(hoursOnDate(HOURS, "2027-05-14")).toEqual({ weekday: "Fri", text: "7 to 11:30 pm", closed: false });
    expect(hoursOnDate(HOURS, "2027-05-17")).toEqual({ weekday: "Mon", text: "Closed", closed: true });
    expect(hoursOnDate(HOURS, "2027-05-16")).toBeNull();
    expect(hoursOnDate(undefined, "2027-05-14")).toBeNull();
  });

  it("says whether the place is open for part of the slot", () => {
    const friday = hoursOnDate(HOURS, "2027-05-14");
    expect(openForSlot(friday, "dinner")).toBe(true);
    expect(openForSlot(friday, "lunch")).toBe(false);
    expect(openForSlot(hoursOnDate(HOURS, "2027-05-13"), "lunch")).toBe(true);
    expect(openForSlot(hoursOnDate(HOURS, "2027-05-17"), "dinner")).toBe(false);
    expect(openForSlot(friday, "stay")).toBeNull();
    expect(openForSlot(null, "dinner")).toBeNull();
  });

  it("labels dates", () => {
    expect(shortDateLabel("2027-05-14")).toBe("Fri 14 May");
  });
});

describe("Google facts in words", () => {
  it("formats the price range per person", () => {
    expect(priceRangeLabel({ currency: "EUR", start: 20, end: 30 })).toBe("€20 to €30 per person");
    expect(priceRangeLabel({ currency: "USD", start: 40 })).toBe("From $40 per person");
    expect(priceRangeLabel(undefined)).toBeNull();
  });

  it("says reservations only when Google does", () => {
    expect(reservationLine(true)).toBe("Takes reservations");
    expect(reservationLine(false)).toBe("No reservations");
    expect(reservationLine(undefined)).toBeNull();
  });

  it("sorts reviews newest first and drops empty ones", () => {
    const reviews = reviewsNewestFirst([
      { text: "Old", publishTime: "2026-01-01T00:00:00Z", author: {} },
      { text: "", publishTime: "2026-10-01T00:00:00Z", author: {} },
      { text: "New", publishTime: "2026-10-20T00:00:00Z", author: {} },
      { text: "Unknown", author: {} },
    ]);
    expect(reviews.map((r) => r.text)).toEqual(["New", "Old", "Unknown"]);
  });

  it("highlights keyword mentions as whole words", () => {
    expect(highlightSegments("Get the oysters and whatever is on ice.", ["Oysters", "on"])).toEqual([
      { text: "Get the ", hit: false },
      { text: "oysters", hit: true },
      { text: " and whatever is on ice.", hit: false },
    ]);
    expect(highlightSegments("Spicy oyster", ["oysters"]).some((s) => s.hit)).toBe(false);
    expect(highlightSegments("No match here", [])).toEqual([{ text: "No match here", hit: false }]);
  });

  it("shortens author names", () => {
    expect(shortAuthor("Rita Santos")).toBe("Rita S.");
    expect(shortAuthor("Daniel")).toBe("Daniel");
    expect(shortAuthor(undefined)).toBeNull();
  });
});

describe("the collapsed pick", () => {
  const because = [
    { entityId: "e-via", name: "Via Carota", share: 71 },
    { entityId: "e-k", name: "Khruangbin", share: 29 },
  ];

  it("says where the pick stands, the match and the top favorite", () => {
    expect(pickLine({ added: true, targetLabel: "Fri dinner", score: 92, because, clientName: "Ana Ruiz" })).toBe(
      "Added to Fri dinner · 92 match · because Ana loves Via Carota",
    );
    expect(pickLine({ added: false, targetLabel: "Fri dinner", because: [], clientName: "Ana" })).toBe("Suggested for Fri dinner");
    expect(pickLine({ added: false, because: [], clientName: "Ana" })).toBe("Recommended");
  });

  it("knows when the place is in the slot", () => {
    const slots = [{ id: "s", day: 1, slot: "dinner" as const, tripPlaceId: "tp", note: "", position: 0 }];
    expect(isInSlot(slots, "tp", { day: 1, slot: "dinner" })).toBe(true);
    expect(isInSlot(slots, "tp", { day: 2, slot: "dinner" })).toBe(false);
  });

  it("counts the photos the strip does not show", () => {
    expect(morePhotosLabel(126, 3)).toBe("+123");
    expect(morePhotosLabel(3, 3)).toBeNull();
  });
});
