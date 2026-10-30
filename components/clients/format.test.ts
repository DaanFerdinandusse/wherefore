import { describe, expect, it } from "vitest";

import {
  activityLabel,
  activityLine,
  daysUntil,
  filterCounts,
  inClientFilter,
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

describe("activityLine", () => {
  const now = new Date("2026-10-21T15:00:00Z");
  it("says Added while the last activity is the day the client was created", () => {
    expect(activityLine(new Date("2026-10-21T09:00:00Z"), new Date("2026-10-21T08:00:00Z"), now)).toBe("Added today");
    expect(activityLine(new Date("2026-10-21T09:00:00Z"), new Date("2026-03-01T08:00:00Z"), now)).toBe("Updated today");
    expect(activityLine(new Date("2026-10-18T09:00:00Z"), new Date("2026-10-18T08:00:00Z"), now)).toBe("Added 3 days ago");
  });
});

describe("client filters", () => {
  const upcoming = { nextTrip: { id: "t1" }, tripCount: 2 };
  const never = { nextTrip: null, tripCount: 0 };
  const pastOnly = { nextTrip: null, tripCount: 3 };

  it("puts a client with a trip ahead under Trip coming up and one without trips under No trip yet", () => {
    expect(inClientFilter(upcoming, "upcoming")).toBe(true);
    expect(inClientFilter(upcoming, "none")).toBe(false);
    expect(inClientFilter(never, "none")).toBe(true);
    expect(inClientFilter(pastOnly, "upcoming")).toBe(false);
    expect(inClientFilter(pastOnly, "none")).toBe(false);
    expect(inClientFilter(pastOnly, "all")).toBe(true);
  });

  it("counts every client under All and only matching ones elsewhere", () => {
    expect(filterCounts([upcoming, never, pastOnly, upcoming])).toEqual({ all: 4, upcoming: 2, none: 1 });
  });
});
