import { describe, expect, it } from "vitest";

import { setItineraryForModel } from "./model-output";
import { findNamedPlace, placesNamed, severalPlacesError, repairedId } from "./place-name";

const row = (name: string) => ({ name });
const board = [row("Cura"), row("Restaurante Cura Bar"), row("Sea Me Peixaria Moderna"), row("Máximo"), row("Aqui Há Peixe")];

describe("placesNamed", () => {
  it("prefers the exact name over a place that only contains it", () => {
    expect(placesNamed("Cura", board)).toEqual([row("Cura")]);
  });

  it("ignores case and accents", () => {
    expect(placesNamed("maximo", board)).toEqual([row("Máximo")]);
  });

  it("finds a place by part of its name", () => {
    expect(placesNamed("Sea Me", board)).toEqual([row("Sea Me Peixaria Moderna")]);
  });

  it("finds a place when the advisor says more than its name", () => {
    expect(placesNamed("Máximo Bistrot", board)).toEqual([row("Máximo")]);
  });

  it("returns every place a loose name could mean", () => {
    const twins = [row("Cafe Lisboa Chiado"), row("Cafe Lisboa Alfama")];
    expect(placesNamed("Lisboa", twins)).toEqual(twins);
    expect(placesNamed("Cafe Chiado", [...twins, row("Chiado Bar")])).toEqual([row("Cafe Lisboa Chiado"), row("Chiado Bar")]);
  });

  it("finds nothing for a name that is not there, or for an id", () => {
    expect(placesNamed("Pastelaria Careca", [row("Pastelaria Alcôa")])).toEqual([]);
    expect(placesNamed("5550d59f-a3d7-4619-a6d0-5c402962c880", board)).toEqual([]);
    expect(placesNamed("", board)).toEqual([]);
  });
});

describe("findNamedPlace", () => {
  const live = (name: string) => ({ name, removed: false });
  const gone = (name: string) => ({ name, removed: true });

  it("finds the one place a name means", () => {
    expect(findNamedPlace("Cura", [live("Cura"), live("Máximo")])).toEqual({ place: live("Cura") });
  });

  it("lists every name when it fits several, and picks none", () => {
    const out = findNamedPlace("Museu", [live("Museu da Cerveja"), live("Atelier Museu Júlio Pomar"), live("Puppet Museum")]);
    expect(out).toEqual({ matches: ["Museu da Cerveja", "Atelier Museu Júlio Pomar"] });
  });

  it("prefers a place still on the trip over a removed one", () => {
    expect(findNamedPlace("Cura", [gone("Cura Bar"), live("Cura Tasca")])).toEqual({ place: live("Cura Tasca") });
  });

  it("finds a removed place when nothing on the trip fits", () => {
    expect(findNamedPlace("Cura", [gone("Cura"), live("Máximo")])).toEqual({ place: gone("Cura") });
  });

  it("finds nothing for a name that is not there", () => {
    expect(findNamedPlace("Cura", [live("Máximo")])).toBeUndefined();
  });
});

describe("severalPlacesError", () => {
  it("names the matches and the recovery, at most five", () => {
    expect(severalPlacesError("Museu", ["A", "B"])).toBe('More than one place on this trip matches "Museu": A, B. Say which one.');
    expect(severalPlacesError("x", ["1", "2", "3", "4", "5", "6"])).toContain("1, 2, 3, 4, 5.");
  });
});

describe("setItineraryForModel", () => {
  it("tells the model when nothing changed, so it never reports a clear that did not happen", () => {
    const note = "Nothing changed: the itinerary was not cleared and is exactly as it was.";
    expect(JSON.stringify(setItineraryForModel({ applied: [], rejected: [], note }))).toContain(note);
    expect(JSON.stringify(setItineraryForModel({ applied: [], rejected: [] }))).not.toContain("note");
  });
});

describe("repairedId", () => {
  const ids = ["2d76582b-ce38-4eea-97b2-9aa934e8891b", "66dbdf32-1111-4222-8333-444455556666"];

  it("finds the place behind an id the model garbled", () => {
    expect(repairedId("2d76582b-ce38-4eea-97e4-d5d9bbb9881b", ids)).toBe(ids[0]);
  });

  it("leaves an id that points at nothing", () => {
    expect(repairedId("ffffffff-ce38-4eea-97e4-d5d9bbb9881b", ids)).toBeUndefined();
  });

  it("does not guess between two places", () => {
    expect(repairedId("2d76582b-0000-4000-8000-000000000000", [...ids, "2d76582b-aaaa-4bbb-8ccc-dddddddddddd"])).toBeUndefined();
  });
});
