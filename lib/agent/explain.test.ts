import { describe, expect, it } from "vitest";

import { allowedFactsFor, parseReasons, validateReason, type ExplainInput } from "./explain";

const place: ExplainInput = {
  tripPlaceId: "tp-1",
  name: "Senhor Uva",
  category: "drink",
  neighborhood: "Estrela",
  because: [
    { name: "Via Carota", share: 52 },
    { name: "Lilia", share: 34 },
    { name: "Other favorites", share: 14 },
  ],
  sharedTags: ["Natural Wine", "Cozy"],
  tags: ["Wine Bar", "Small Plates", "Candlelit"],
  yourPlace: true,
};
const facts = allowedFactsFor(place, { clientName: "Ana Ruiz", extraNames: ["Clara", "Lisbon", "Portugal"] });

describe("validateReason", () => {
  it("accepts a sentence that names only favorites and tags from the input", () => {
    const check = validateReason("Shares the cozy, natural wine feel Ana loves at Via Carota.", facts);
    expect(check).toEqual({ ok: true, reason: "Shares the cozy, natural wine feel Ana loves at Via Carota." });
  });

  it("is case and accent insensitive and allows possessives", () => {
    expect(validateReason("Ana's love of LILIA shows in the small plates.", facts).ok).toBe(true);
    expect(validateReason("Like Via Carota, a candlelit room in Estrela.", facts).ok).toBe(true);
  });

  it("rejects a name that is not in the facts", () => {
    const check = validateReason("Run by the team behind Taberna da Rua, it echoes Via Carota.", facts);
    expect(check.ok).toBe(false);
  });

  it("rejects numbers, dashes, several sentences and empty text", () => {
    expect(validateReason("Rated 4.8 and close to Via Carota in spirit.", facts).ok).toBe(false);
    expect(validateReason("Natural wine \u2014 like Via Carota.", facts).ok).toBe(false);
    expect(validateReason("Natural wine like Via Carota. Ana will love it.", facts).ok).toBe(false);
    expect(validateReason("   ", facts).ok).toBe(false);
  });

  it("rejects a sentence that mentions no favorite and no shared taste", () => {
    expect(validateReason("A wine bar in Estrela with small plates.", facts).ok).toBe(false);
  });

  it("does not let the catch-all Other favorites count as a favorite", () => {
    expect(facts.anchors).not.toContain("Other favorites");
  });

  it("rejects text over the length limit", () => {
    expect(validateReason(`Natural wine like Via Carota ${"and more ".repeat(30)}`, facts).ok).toBe(false);
  });
});

describe("parseReasons", () => {
  it("reads the JSON object out of a fenced reply", () => {
    const text = 'Here you go:\n```json\n{"reasons":[{"place_id":"tp-1","reason":"Natural wine like Via Carota."}]}\n```';
    expect(parseReasons(text)).toEqual([{ place_id: "tp-1", reason: "Natural wine like Via Carota." }]);
  });

  it("returns nothing for a reply that is not the expected shape", () => {
    expect(parseReasons("no json here")).toEqual([]);
    expect(parseReasons('{"reasons":"nope"}')).toEqual([]);
  });
});
