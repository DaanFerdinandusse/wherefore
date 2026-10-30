import { describe, expect, it } from "vitest";

import { askConstraints, isNamedKind, meetsAskConstraints, namedKinds, splitIntent } from "./find-places";

const closedMonday = {
  monday: [{ opens: null, closes: null, closed: true }],
  tuesday: [{ opens: "T12:00:00", closes: "T23:00:00", closed: false }],
};
const place = (properties: Record<string, unknown>) => ({ tags: [], types: [], primaryType: null, priceLevel: null, lat: null, lon: null, properties });
const base = { tagIds: [], loosened: [] as string[] };

describe("the open day on the advisor's places", () => {
  const constraints = askConstraints({ ...base, openDay: "monday" });

  it("leaves a place out when its stored hours say closed that day", () => {
    expect(meetsAskConstraints(place({ hours: closedMonday }), constraints)).toBe(false);
  });

  it("keeps a place that is open that day", () => {
    expect(meetsAskConstraints(place({ hours: closedMonday }), askConstraints({ ...base, openDay: "tuesday" }))).toBe(true);
  });

  it("does not hold unknown hours against a place", () => {
    expect(meetsAskConstraints(place({}), constraints)).toBe(true);
    expect(meetsAskConstraints(place({ hours: { tuesday: closedMonday.tuesday } }), constraints)).toBe(true);
    expect(meetsAskConstraints({ tags: [], priceLevel: null, lat: null, lon: null }, constraints)).toBe(true);
  });

  it("stays in force when the search itself had to drop the open day", () => {
    const loosened = askConstraints({ ...base, loosened: ["hours"], openDay: "monday" });
    expect(meetsAskConstraints(place({ hours: closedMonday }), loosened)).toBe(false);
  });
});

describe("less known and Michelin on the advisor's places", () => {
  it("leaves out a well known place on a less known ask, and keeps an unknown one", () => {
    const constraints = askConstraints({ ...base, popularityMax: 0.6 });
    expect(meetsAskConstraints(place({ popularity: 0.97 }), constraints)).toBe(false);
    expect(meetsAskConstraints(place({ popularity: 0.2 }), constraints)).toBe(true);
    expect(meetsAskConstraints(place({}), constraints)).toBe(true);
  });

  it("keeps only a listed place on a Michelin ask", () => {
    const constraints = askConstraints({ ...base, michelin: true });
    expect(meetsAskConstraints(place({ external: { michelin: [{ id: "1", stars: null }] } }), constraints)).toBe(true);
    expect(meetsAskConstraints(place({ external: {} }), constraints)).toBe(false);
  });

  it("does not apply a filter the search dropped", () => {
    const constraints = askConstraints({ ...base, loosened: ["popularity", "michelin"], popularityMax: 0.6, michelin: true });
    expect(constraints.popularityMax).toBeUndefined();
    expect(constraints.michelin).toBeUndefined();
    expect(meetsAskConstraints(place({ popularity: 0.97 }), constraints)).toBe(true);
  });
});

describe("a named kind of place", () => {
  const MUSEUM = "urn:tag:genre:place:museum";
  const place = (primaryType: string | null, tagIds: string[] = []) => ({
    primaryType,
    types: [],
    tags: tagIds.map((tagId) => ({ tagId, name: tagId })),
  });

  it("keeps museum in a museum ask, under the see category", () => {
    expect(splitIntent("museum")).toEqual({ text: "museum", category: "see" });
    expect(splitIntent("art galleries")).toEqual({ text: "art galleries", category: "see" });
  });

  it("still reads a plain noun as the category alone", () => {
    expect(splitIntent("restaurants")).toEqual({ text: "", category: "eat" });
  });

  it("is strict for places to see, never for food, drink or shops", () => {
    expect(namedKinds([MUSEUM], "see")).toEqual([MUSEUM]);
    expect(namedKinds(["urn:tag:genre:place:clothing_store"], undefined)).toEqual([]);
    expect(namedKinds(["urn:tag:genre:place:restaurant:seafood"], "eat")).toEqual([]);
    expect(namedKinds(["urn:tag:cuisine:qloo:italian"], "see")).toEqual([]);
  });

  it("lets a museum through and keeps a market and a garden out", () => {
    expect(isNamedKind(place(MUSEUM), [MUSEUM])).toBe(true);
    expect(isNamedKind(place("urn:tag:genre:place:art_museum"), [MUSEUM])).toBe(true);
    expect(isNamedKind(place(MUSEUM), ["urn:tag:genre:place:art_museum"])).toBe(true);
    expect(isNamedKind(place("urn:tag:genre:place:market"), [MUSEUM])).toBe(false);
    expect(isNamedKind(place("urn:tag:genre:place:garden"), [MUSEUM])).toBe(false);
  });

  it("trusts the place's genre over a loose tag: a restaurant called Museu is a restaurant", () => {
    expect(isNamedKind(place("urn:tag:genre:place:restaurant", [MUSEUM]), [MUSEUM])).toBe(false);
  });

  it("reads the tags only when a place has no genre", () => {
    expect(isNamedKind(place(null, [MUSEUM]), [MUSEUM])).toBe(true);
    expect(isNamedKind(place(null), [MUSEUM])).toBe(false);
  });

  it("changes nothing for an ask that names no kind", () => {
    expect(isNamedKind(place("urn:tag:genre:place:market"), [])).toBe(true);
  });

  it("holds for the advisor's own places too", () => {
    const market = { ...place("urn:tag:genre:place:market"), priceLevel: null, lat: null, lon: null };
    expect(meetsAskConstraints(market, { tagIds: [], kinds: [MUSEUM] })).toBe(false);
    expect(meetsAskConstraints({ ...market, primaryType: MUSEUM }, { tagIds: [], kinds: [MUSEUM] })).toBe(true);
  });

  it("is kept when the tags are dropped", () => {
    expect(askConstraints({ tagIds: [MUSEUM], kinds: [MUSEUM], loosened: ["tags"] })).toMatchObject({ tagIds: [], kinds: [MUSEUM] });
  });
});

describe("what a named kind searches on", () => {
  it("leaves out tags that are not kinds, like a garden as an amenity", () => {
    const resolved = ["urn:tag:category:place:garden", "urn:tag:genre:place:garden", "urn:tag:amenity:qloo:garden"];
    expect(namedKinds(resolved, "see")).toEqual(["urn:tag:category:place:garden", "urn:tag:genre:place:garden"]);
  });
});
