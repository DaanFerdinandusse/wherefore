import { describe, expect, it } from "vitest";

import { planTripHref, safeReturn, withClient } from "./return-to";

describe("safeReturn", () => {
  it("keeps a path on this site with its query", () => {
    expect(safeReturn("/trips?new=1&where=Lisbon")).toBe("/trips?new=1&where=Lisbon");
  });

  it("drops anything that could leave the site", () => {
    expect(safeReturn("https://evil.example/x")).toBeNull();
    expect(safeReturn("//evil.example/x")).toBeNull();
    expect(safeReturn("/\\evil.example")).toBeNull();
    expect(safeReturn("trips")).toBeNull();
    expect(safeReturn("")).toBeNull();
    expect(safeReturn(null)).toBeNull();
  });
});

describe("withClient and planTripHref", () => {
  it("sets the client on the return url, replacing an old one", () => {
    expect(withClient("/trips?new=1&client=old", "c1")).toBe("/trips?new=1&client=c1");
    expect(withClient("/places", "c1")).toBe("/places?client=c1");
  });

  it("opens the New trip panel with the client", () => {
    expect(planTripHref(null, "c1")).toBe("/clients?new=1&client=c1");
    expect(planTripHref("/trips?where=Lisbon", "c1")).toBe("/trips?where=Lisbon&client=c1&new=1");
  });
});
