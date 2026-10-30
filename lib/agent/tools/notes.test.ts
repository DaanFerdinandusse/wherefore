import { describe, expect, it } from "vitest";

import { askConstraints, isKindTag, meetsAskConstraints, singularOf } from "./find-places";
import { cleanAgentNote, makesClaim } from "./notes";
import { noteFactsOf } from "./place-tools";

describe("cleanAgentNote", () => {
  const facts = ["Known for its natural wine list", "18:30 to 23:00"];

  it("drops hours, prices and reservations the facts do not hold", () => {
    expect(
      cleanAgentNote("Great for a slow start. Opens at 9am. Mains are about 20 euros. I booked a table for two.", facts),
    ).toBe("Great for a slow start.");
  });

  it("keeps a claim that quotes a provided fact", () => {
    expect(cleanAgentNote("Open 18:30 to 23:00 on Saturdays. Order the orange wine.", facts)).toBe(
      "Open 18:30 to 23:00 on Saturdays. Order the orange wine.",
    );
  });

  it("turns dashes into commas and returns empty when nothing is left", () => {
    expect(cleanAgentNote("Sunset spot \u2014 go early", [])).toBe("Sunset spot, go early");
    expect(cleanAgentNote("Reservations required.", [])).toBe("");
    expect(cleanAgentNote(undefined, [])).toBe("");
  });

  it("does not take plain words for claims", () => {
    expect(makesClaim("Close to the river, with an open-air terrace.")).toBe(false);
    expect(makesClaim("Gluten-free options.")).toBe(false);
    expect(makesClaim("Closes at midnight.")).toBe(true);
  });
});

describe("what a note may quote", () => {
  const row = {
    description: "Known for its natural wine list",
    properties: { hours: { friday: [{ opens: "T18:30", closes: "T23:00" }] } },
    tags: [{ tagId: "urn:tag:planning:place:accepts_reservations", name: "Accepts reservations", type: "urn:tag:planning:place" }],
  };

  it("holds the descriptions and the hours, never a tag", () => {
    expect(noteFactsOf(row)).toEqual(["Known for its natural wine list", "18:30 to 23:00"]);
  });

  it("does not let a short practical fact carry invented claims", () => {
    expect(cleanAgentNote("Accepts reservations, open until 2am, about 40 euros.", noteFactsOf(row))).toBe("");
    expect(cleanAgentNote("Accepts reservations.", noteFactsOf(row))).toBe("");
  });
});

describe("ask constraints for advisor places", () => {
  const wine = "urn:tag:category:place:wine_bar";
  const place = { tags: [{ tagId: wine, name: "Wine Bar" }], priceLevel: 2, lat: 38.71, lon: -9.14 };

  it("applies the tags, the price cap and the area the search kept", () => {
    const c = askConstraints({ tagIds: [wine], loosened: [], priceMax: 2, area: { lat: 38.71, lon: -9.14, radiusM: 1500 } });
    expect(meetsAskConstraints(place, c)).toBe(true);
    expect(meetsAskConstraints({ ...place, tags: [] }, c)).toBe(false);
    expect(meetsAskConstraints({ ...place, priceLevel: 4 }, c)).toBe(false);
    expect(meetsAskConstraints({ ...place, lat: 38.8, lon: -9.3 }, c)).toBe(false);
    // Unknown price or position does not count against a place.
    expect(meetsAskConstraints({ ...place, priceLevel: null, lat: null, lon: null }, c)).toBe(true);
  });

  it("drops a filter the search itself had to loosen", () => {
    const c = askConstraints({ tagIds: [wine], loosened: ["tags", "price"], priceMax: 1 });
    expect(c).toEqual({ tagIds: [] });
    expect(meetsAskConstraints({ ...place, tags: [], priceLevel: 4 }, c)).toBe(true);
  });
});

describe("tag lookup", () => {
  it("tells a tag for what a place is from one for what is near it", () => {
    expect(isKindTag("urn:tag:genre:place:shopping_mall")).toBe(true);
    expect(isKindTag("urn:tag:category:place:shopping_mall")).toBe(true);
    expect(isKindTag("urn:tag:nearby_attraction:qloo:shopping_malls")).toBe(false);
  });

  it("finds the singular of a plural only", () => {
    expect(singularOf("shopping malls")).toBe("shopping mall");
    expect(singularOf("seafood")).toBeNull();
    expect(singularOf("business class")).toBeNull();
  });
});
