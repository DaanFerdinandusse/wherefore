import { describe, expect, it } from "vitest";

import { addDays, addMonths, monthLabel, monthWeeks, nextRange, nightsBetween, rangeLabel } from "./dates";

describe("monthWeeks", () => {
  it("starts May 2027 on a Saturday, Monday first", () => {
    const weeks = monthWeeks({ year: 2027, month: 4 });
    expect(weeks[0]).toEqual([null, null, null, null, null, "2027-05-01", "2027-05-02"]);
    expect(weeks.at(-1)?.[0]).toBe("2027-05-31");
    expect(weeks).toHaveLength(6);
  });

  it("starts June 2027 on a Tuesday", () => {
    expect(monthWeeks({ year: 2027, month: 5 })[0][1]).toBe("2027-06-01");
  });
});

describe("nextRange", () => {
  it("sets the start, then the end, then restarts", () => {
    const a = nextRange({}, "2027-05-14");
    expect(a).toEqual({ start: "2027-05-14" });
    const b = nextRange(a, "2027-05-18");
    expect(b).toEqual({ start: "2027-05-14", end: "2027-05-18" });
    expect(nextRange(b, "2027-05-20")).toEqual({ start: "2027-05-20" });
  });

  it("restarts when the second click is on or before the start", () => {
    expect(nextRange({ start: "2027-05-14" }, "2027-05-10")).toEqual({ start: "2027-05-10" });
    expect(nextRange({ start: "2027-05-14" }, "2027-05-14")).toEqual({ start: "2027-05-14" });
  });
});

describe("labels", () => {
  it("matches the design footer", () => {
    expect(rangeLabel({ start: "2027-05-14", end: "2027-05-18" })).toBe("Fri 14 to Tue 18 May · 4 nights");
  });

  it("names both months across a month boundary", () => {
    expect(rangeLabel({ start: "2027-05-30", end: "2027-06-01" })).toBe("Sun 30 May to Tue 1 Jun · 2 nights");
  });

  it("asks for the missing day", () => {
    expect(rangeLabel({})).toBe("Pick the first day");
    expect(rangeLabel({ start: "2027-05-14" })).toBe("Fri 14 May · pick the last day");
  });

  it("counts one night in the singular", () => {
    expect(rangeLabel({ start: "2027-05-14", end: "2027-05-15" })).toBe("Fri 14 to Sat 15 May · 1 night");
  });

  it("does month and day arithmetic in UTC", () => {
    expect(monthLabel(addMonths({ year: 2027, month: 11 }, 1))).toBe("January 2028");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(nightsBetween("2027-03-27", "2027-03-29")).toBe(2);
  });
});
