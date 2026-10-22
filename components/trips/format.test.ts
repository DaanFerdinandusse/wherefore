import { describe, expect, it } from "vitest";

import {
  cardDatesLabel,
  cardStatus,
  daysUntil,
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

describe("cardStatus", () => {
  it("shows filled days with a bar while planning", () => {
    const status = cardStatus(tripCard(), "2027-01-01");
    expect(status.text).toBe("20 places · 3 of 5 days filled");
    expect(status.progress).toBeCloseTo(0.6);
  });
  it("shows the day of the trip while traveling", () => {
    const status = cardStatus(tripCard({ stage: "traveling" }), "2027-05-15");
    expect(status).toMatchObject({ text: "Day 2 of 5", barTone: "green" });
  });
  it("shows when a trip finished", () => {
    expect(cardStatus(tripCard({ stage: "done", counts: { places: 9 } }), "2027-06-01").text).toBe(
      "Finished 18 May · 9 places",
    );
  });
  it("warns when the first list failed", () => {
    expect(cardStatus(tripCard({ seedStatus: "failed" }), "2027-01-01").tone).toBe("warning");
  });
  it("says when there are no places yet", () => {
    expect(cardStatus(tripCard({ seedStatus: "pending", counts: { places: 0 } }), "2027-01-01").text).toBe(
      "No places yet",
    );
  });
});
