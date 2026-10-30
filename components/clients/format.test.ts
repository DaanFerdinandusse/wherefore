import { describe, expect, it } from "vitest";

import {
  activityLabel,
  clientTripState,
  daysUntil,
  filterCounts,
  firstName,
  inDaysLabel,
  monthYear,
  namesLine,
  tripDatesLabel,
} from "./format";

describe("namesLine", () => {
  it("joins one, two and three names", () => {
    expect(namesLine([])).toBe("");
    expect(namesLine(["Via Carota"])).toBe("Via Carota");
    expect(namesLine(["Via Carota", "Buna"])).toBe("Via Carota and Buna");
    expect(namesLine(["Via Carota", "Buna", "Clamato"])).toBe("Via Carota, Buna and Clamato");
  });

  it("counts the names it does not show", () => {
    expect(namesLine(["Via Carota", "Buna", "Clamato"], 6)).toBe("Via Carota, Buna, Clamato and 3 more");
    expect(namesLine(["Via Carota"], 2)).toBe("Via Carota and 1 more");
  });
});

const TODAY = "2026-10-21";

describe("tripDatesLabel", () => {
  it("prints a range in one month without the current year", () => {
    expect(tripDatesLabel("2026-11-12", "2026-11-16", TODAY)).toBe("12 to 16 Nov");
  });

  it("names both months across a month boundary", () => {
    expect(tripDatesLabel("2026-11-28", "2026-12-03", TODAY)).toBe("28 Nov to 3 Dec");
  });

  it("adds the year when it is not this year", () => {
    expect(tripDatesLabel("2026-03-04", "2026-03-08", "2027-01-02")).toBe("4 to 8 Mar 2026");
    expect(tripDatesLabel("2026-12-30", "2027-01-02", TODAY)).toBe("30 Dec 2026 to 2 Jan 2027");
  });

  it("handles a single day, an open end and no dates", () => {
    expect(tripDatesLabel("2026-11-12", "2026-11-12", TODAY)).toBe("12 Nov");
    expect(tripDatesLabel("2026-11-12", null, TODAY)).toBe("From 12 Nov");
    expect(tripDatesLabel(null, null, TODAY)).toBeNull();
  });
});

describe("days", () => {
  it("counts days to a date and words them", () => {
    expect(daysUntil("2026-11-12", TODAY)).toBe(22);
    expect(inDaysLabel(22)).toBe("in 22 days");
    expect(inDaysLabel(1)).toBe("tomorrow");
    expect(inDaysLabel(0)).toBe("today");
  });
});

describe("activityLabel", () => {
  const now = new Date("2026-10-21T15:00:00Z");
  it("is relative for the last week, then a date", () => {
    expect(activityLabel(new Date("2026-10-21T08:00:00Z"), now)).toBe("Updated today");
    expect(activityLabel(new Date("2026-10-20T08:00:00Z"), now)).toBe("Updated yesterday");
    expect(activityLabel(new Date("2026-10-18T08:00:00Z"), now)).toBe("Updated 3 days ago");
    expect(activityLabel(new Date("2026-03-12T08:00:00Z"), now)).toBe("Updated 12 Mar");
    expect(activityLabel(new Date("2025-03-12T08:00:00Z"), now)).toBe("Updated 12 Mar 2025");
  });
});

describe("names and months", () => {
  it("takes the first word of a name", () => {
    expect(firstName("Ana Ruiz")).toBe("Ana");
    expect(firstName("  Clara ")).toBe("Clara");
  });

  it("prints month and year", () => {
    expect(monthYear(new Date("2024-03-05T00:00:00Z"))).toBe("March 2024");
  });
});

describe("clientTripState and filterCounts", () => {
  it("sorts clients into the filter pills", () => {
    expect(clientTripState(null, TODAY)).toBe("none");
    expect(clientTripState({ startDate: null }, TODAY)).toBe("upcoming");
    expect(clientTripState({ startDate: "2026-11-12" }, TODAY)).toBe("upcoming");
    expect(clientTripState({ startDate: "2026-10-20" }, TODAY)).toBe("traveling");
    expect(filterCounts(["none", "upcoming", "upcoming", "traveling"])).toEqual({
      all: 4,
      upcoming: 2,
      traveling: 1,
      none: 1,
    });
  });
});
