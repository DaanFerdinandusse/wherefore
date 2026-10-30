import { describe, expect, it } from "vitest";

import { mapRegionPrompt, withoutRegionMarker } from "./region-prompt";

const region = { lat: 38.71234567, lon: -9.14, radiusM: 1250 };

describe("mapRegionPrompt", () => {
  it("names the search and carries the exact circle", () => {
    expect(mapRegionPrompt(region, "dinner options")).toBe(
      "Search this region of the map for dinner options.\n[map region: lat 38.71235, lon -9.14000, radius 1250 m]",
    );
  });
});

describe("withoutRegionMarker", () => {
  it("leaves the sentence people read", () => {
    expect(withoutRegionMarker(mapRegionPrompt(region, "dinner options"))).toBe("Search this region of the map for dinner options.");
  });

  it("leaves other messages alone", () => {
    expect(withoutRegionMarker("Dinner near the river [map region] please")).toBe("Dinner near the river [map region] please");
  });

  it("only takes a marker at the end", () => {
    const text = "[map region: lat 1.0, lon 2.0, radius 300 m] and more";
    expect(withoutRegionMarker(text)).toBe(text);
  });
});
