import { describe, expect, it } from "vitest";

import { preferCities } from "./localities";

const c = (name: string, disambiguation: string) => ({ name, disambiguation });

describe("preferCities", () => {
  it("puts the city above the same-named region of its country", () => {
    const state = c("New York", "New York, United States of America");
    const city = c("New York", "New York, New York, United States of America");
    const county = c("New York County", "New York County, New York, New York, United States of America");
    expect(preferCities([state, city, county])).toEqual([city, state, county]);
  });

  it("keeps the provider's order when the first is the city", () => {
    const berlin = c("Berlin", "Berlin, Deutschland");
    const other = c("Berlin", "Berlin, Hartford, Connecticut, United States of America");
    expect(preferCities([berlin, other])).toEqual([berlin, other]);
    const london = c("London", "London, Inner London - East, Greater London, England, United Kingdom");
    expect(preferCities([london])).toEqual([london]);
  });
});
