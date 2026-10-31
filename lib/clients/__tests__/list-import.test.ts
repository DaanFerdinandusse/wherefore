import { describe, expect, it } from "vitest";

import type { NormalizedPlace } from "@/lib/qloo/contracts";

import { exactMatch, sameName, spreadByArea } from "../list-import";

function place(overrides: Partial<NormalizedPlace>): { place: NormalizedPlace } {
  return { place: { name: "Somewhere", lat: 19.4, lon: -99.1, googleCid: null, ...overrides } as NormalizedPlace };
}

const item = { name: "Dishoom Shoreditch", lat: 51.5245, lon: -0.0766, googleId: "123" };

describe("spreadByArea", () => {
  const at = (name: string, lat: number, lon: number) => ({ name, lat, lon });

  it("takes one place from each area before a second from any", () => {
    const out = spreadByArea([at("cdmx 1", 19.4, -99.1), at("cdmx 2", 19.41, -99.12), at("cdmx 3", 19.42, -99.15), at("london 1", 51.5, -0.1), at("paris 1", 48.8, 2.3)]);
    expect(out.map((p) => p.name)).toEqual(["cdmx 1", "london 1", "paris 1", "cdmx 2", "cdmx 3"]);
  });

  it("keeps every item", () => {
    expect(spreadByArea([at("a", 1, 1), at("b", 2, 2), at("c", 1.1, 1.1)])).toHaveLength(3);
  });

  it("handles an empty list", () => {
    expect(spreadByArea([])).toEqual([]);
  });
});

describe("sameName", () => {
  it("ignores case, accents and punctuation", () => {
    expect(sameName("Café  de la Poste!", "cafe de la poste")).toBe(true);
    expect(sameName("Ayano's Bar", "AYANOS BAR")).toBe(false);
  });

  it("does not treat a longer name as the same", () => {
    expect(sameName("Tsukishima", "Tsukishima Monja Moheji Hanare")).toBe(false);
  });
});

describe("exactMatch", () => {
  it("matches on the Google id, whatever the name", () => {
    const hit = place({ name: "Dishoom", googleCid: "123", lat: 0, lon: 0 });
    expect(exactMatch(item, [place({ name: "Other" }), hit])).toBe(hit.place);
  });

  it("prefers the id over a same-name place earlier in the list", () => {
    const sameNamed = place({ name: item.name, lat: item.lat, lon: item.lon, googleCid: "9" });
    const byId = place({ name: "Dishoom", googleCid: "123" });
    expect(exactMatch(item, [sameNamed, byId])).toBe(byId.place);
  });

  it("matches the same name in the same spot when the ids differ", () => {
    const hit = place({ name: "DISHOOM Shoreditch", lat: 51.5246, lon: -0.0765, googleCid: "9" });
    expect(exactMatch(item, [hit])).toBe(hit.place);
  });

  it("leaves out the same name somewhere else", () => {
    expect(exactMatch(item, [place({ name: item.name, lat: 51.6, lon: -0.2 })])).toBeNull();
  });

  it("leaves out a close name in the same spot", () => {
    expect(exactMatch({ ...item, googleId: null }, [place({ name: "Dishoom Shoreditch Bar", lat: item.lat, lon: item.lon })])).toBeNull();
  });

  it("leaves out a candidate that is not a place, or has no coordinates", () => {
    expect(exactMatch(item, [{}, place({ name: item.name, lat: null, lon: null })])).toBeNull();
  });
});
