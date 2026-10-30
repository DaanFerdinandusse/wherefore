import { describe, expect, it } from "vitest";

import {
  cardDatesLabel,
  daysUntil,
  doneRowLabel,
  firstName,
  monthYearLabel,
  nightsCount,
  nightsLabel,
  tripDatesLabel,
  tripDayToday,
} from "./format";
import { tripCard } from "./fixtures";

describe("tripDatesLabel", () => {
  it("names the month once inside one month", () => {
    expect(tripDatesLabel("2027-05-14", "2027-05-18")).toBe("14 to 18 May");
  });
  it("names both months across months", () => {
    expect(tripDatesLabel("2027-05-28", "2027-06-02")).toBe("28 May to 2 Jun");
  });
  it("adds years across years", () => {
    expect(tripDatesLabel("2026-12-28", "2027-01-02")).toBe("28 Dec 2026 to 2 Jan 2027");
  });
  it("handles a start without an end, a one day trip and no dates", () => {
    expect(tripDatesLabel("2027-05-14", null)).toBe("From 14 May");
    expect(tripDatesLabel("2027-05-14", "2027-05-14")).toBe("14 May");
    expect(tripDatesLabel(null, null)).toBeNull();
  });
});

describe("nights", () => {
  it("counts nights between two days", () => {
    expect(nightsCount("2027-05-14", "2027-05-18")).toBe(4);
    expect(nightsCount("2027-05-31", "2027-06-01")).toBe(1);
    expect(nightsCount("2027-05-18", "2027-05-14")).toBe(0);
  });
  it("labels one night and many nights", () => {
    expect(nightsLabel("2027-05-14", "2027-05-15")).toBe("1 night");
    expect(nightsLabel("2027-05-14", "2027-05-18")).toBe("4 nights");
  });
});

describe("small labels", () => {
  it("reads the first name", () => {
    expect(firstName("Ana Ruiz")).toBe("Ana");
    expect(firstName("  Marcus ")).toBe("Marcus");
  });
  it("formats month and year", () => {
    expect(monthYearLabel("2026-09-14")).toBe("Sep 2026");
  });
  it("finds the trip day and days until departure", () => {
    const trip = { startDate: "2027-05-14", endDate: "2027-05-18" };
    expect(tripDayToday(trip, "2027-05-15")).toBe(2);
    expect(tripDayToday(trip, "2027-05-19")).toBeNull();
    expect(daysUntil("2027-05-14", "2027-05-11")).toBe(3);
    expect(daysUntil("2027-05-14", "2027-05-14")).toBeNull();
  });
});

describe("cardDatesLabel", () => {
  it("shows the range, the month once done, or no dates", () => {
    expect(cardDatesLabel(tripCard())).toBe("14 to 18 May");
    expect(cardDatesLabel(tripCard({ stage: "done" }))).toBe("May 2027");
    expect(cardDatesLabel(tripCard({ startDate: null, endDate: null }))).toBe("Dates not set");
  });
});

describe("doneRowLabel", () => {
  it("names the client and the month, with the year when it is another year", () => {
    expect(doneRowLabel(tripCard({ clientName: "Elena Costa", startDate: "2026-09-14" }), "2026-10-29")).toBe(
      "Elena Costa, Sep",
    );
    expect(doneRowLabel(tripCard({ clientName: "Ana Ruiz", startDate: "2025-03-06" }), "2026-10-29")).toBe(
      "Ana Ruiz, Mar 2025",
    );
    expect(doneRowLabel(tripCard({ clientName: "Ana Ruiz", startDate: null }), "2026-10-29")).toBe("Ana Ruiz");
  });
});
