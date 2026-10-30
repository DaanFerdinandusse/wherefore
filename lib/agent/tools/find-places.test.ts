import { describe, expect, it } from "vitest";

import { askConstraints, meetsAskConstraints } from "./find-places";

const closedMonday = {
  monday: [{ opens: null, closes: null, closed: true }],
  tuesday: [{ opens: "T12:00:00", closes: "T23:00:00", closed: false }],
};
const place = (properties: Record<string, unknown>) => ({ tags: [], priceLevel: null, lat: null, lon: null, properties });
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
