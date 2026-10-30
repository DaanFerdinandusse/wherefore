import { describe, expect, it } from "vitest";

import {
  defaultPick,
  factSnippets,
  favoriteDrivers,
  listOf,
  parsePicks,
  reasonsFromPicks,
  renderReason,
  snippetClause,
  tagPhrase,
  validatePick,
  type ExplainContext,
  type ExplainInput,
} from "./explain";

const place: ExplainInput = {
  tripPlaceId: "tp-1",
  name: "Senhor Uva",
  category: "drink",
  neighborhood: "Estrela",
  because: [
    { name: "Via Carota", share: 52, entityId: "e-via" },
    { name: "Lilia", share: 30, entityId: "e-lilia" },
    { name: "Your places", share: 10, entityId: "advisor" },
    { name: "This trip's picks", share: 10, entityId: "trip-picks" },
    { name: "Other favorites", share: 8, entityId: "other" },
  ],
  sharedTags: ["Cozy", "Italian", "Natural Wine"],
  facts: ["Known for its natural wine list", "Senhor Uva pours low intervention wines from Portugal"],
  yourPlace: true,
};
const context: ExplainContext = { clientName: "Ana Ruiz", properNames: ["Lisbon", "Portugal"] };

describe("structured reasons", () => {
  it("renders the template from picks that are all in the input", () => {
    const selection = validatePick(place, { drivers: ["Via Carota", "Lilia"], tags: ["Cozy", "Italian"], fact: 0 });
    expect(selection).toEqual({ drivers: ["Via Carota", "Lilia"], tags: ["Cozy", "Italian"], fact: "Known for its natural wine list" });
    expect(renderReason(place, selection!, context)).toBe(
      "Because Ana loves Via Carota and Lilia; it shares cozy and Italian; known for its natural wine list.",
    );
  });

  it("drops invented facts: free lobster and rooftop dining never reach the sentence", () => {
    const lobster = { ...place, because: [{ name: "Via Carota", share: 100, entityId: "e-via" }], sharedTags: [], facts: [] };
    const result = reasonsFromPicks(
      [lobster],
      [{ place_id: "tp-1", drivers: ["Via Carota", "Free Lobster"], tags: ["free lobster", "rooftop dining"], fact: 3 }],
      context,
    );
    const reason = result.reasons.get("tp-1");
    expect(reason).toBe("Because Ana loves Via Carota.");
    expect(reason).not.toMatch(/lobster|rooftop/i);
  });

  it("gives no reason when no picked favorite is in the input", () => {
    expect(validatePick(place, { drivers: ["Lobster Shack"], tags: ["Cozy"] })).toBeNull();
    const result = reasonsFromPicks([place], [{ place_id: "tp-1", drivers: ["Other favorites", "Your places", "This trip's picks"] }], context);
    expect(result.reasons.size).toBe(0);
    expect(result.rejected).toHaveLength(1);
  });

  it("never picks the plain driver entries as favorites", () => {
    expect(favoriteDrivers(place)).toEqual(["Via Carota", "Lilia"]);
  });

  it("matches picks case and accent insensitively, but writes the input's spelling", () => {
    const selection = validatePick(place, { drivers: ["via carota"], tags: ["NATURAL WINE"] });
    expect(selection).toEqual({ drivers: ["Via Carota"], tags: ["Natural Wine"] });
  });

  it("ignores an out of range or fractional snippet index", () => {
    expect(validatePick(place, { drivers: ["Lilia"], fact: 5 })?.fact).toBeUndefined();
    expect(validatePick(place, { drivers: ["Lilia"], fact: -1 })?.fact).toBeUndefined();
  });

  it("names the traveler who loves each favorite", () => {
    const reason = renderReason(
      place,
      { drivers: ["Via Carota", "Lilia"], tags: [] },
      { ...context, ownerOf: { Lilia: "Marcus Lee" } },
    );
    expect(reason).toBe("Because Ana loves Via Carota and Marcus loves Lilia.");
  });

  describe("with a favorite the place is like", () => {
    const like: ExplainInput = {
      ...place,
      because: [
        { name: "Lilia", share: 27, entityId: "e-lilia" },
        { name: "Via Carota", share: 25, entityId: "e-via", tags: ["Italian", "Warm", "Stylish"] },
        { name: "Other favorites", share: 48, entityId: "other" },
      ],
    };
    const band = { name: "Khruangbin", share: 20, entityId: "e-band", media: true };

    it("names that favorite and its tags, whatever the model picked", () => {
      const result = reasonsFromPicks([like], [{ place_id: "tp-1", drivers: ["Lilia"], tags: ["Cozy"] }], context);
      expect(result.reasons.get("tp-1")).toBe("Like Via Carota: Italian, warm and stylish.");
    });

    it("keeps the model's snippet clause as it is", () => {
      const reason = renderReason(like, { drivers: ["Lilia"], tags: ["Cozy"], fact: "Known for its natural wine list" }, context);
      expect(reason).toBe("Like Via Carota: Italian, warm and stylish; known for its natural wine list.");
    });

    it("adds a noted artist or film, with the fact that ties them", () => {
      const noted = { ...like, because: [...like.because, band], mediaNote: { name: "Khruangbin" } };
      expect(renderReason(noted, { drivers: ["Lilia"], tags: [] }, context)).toBe(
        "Like Via Carota: Italian, warm and stylish. Also fits Ana's love of Khruangbin.",
      );
      const fact = { ...noted, mediaNote: { name: "Khruangbin", fact: "reviews mention live music" } };
      expect(renderReason(fact, { drivers: ["Lilia"], tags: [] }, context)).toBe(
        "Like Via Carota: Italian, warm and stylish. Also fits Ana's love of Khruangbin: reviews mention live music.",
      );
    });

    it("says a shared feel across kinds of place, and no more", () => {
      const feel = {
        ...place,
        because: [{ name: "Attaboy", share: 30, entityId: "e-bar", tags: ["Intimate", "Romantic"], feel: true }],
      };
      expect(renderReason(feel, { drivers: ["Attaboy"], tags: [] }, context)).toBe("Same intimate, romantic feel as Attaboy.");
    });

    it("says whose love it is", () => {
      const reason = renderReason(
        { ...like, because: [...like.because, band], mediaNote: { name: "Khruangbin" } },
        { drivers: ["Lilia"], tags: [] },
        { ...context, ownerOf: { Khruangbin: "Marcus Lee" } },
      );
      expect(reason).toContain("Also fits Marcus's love of Khruangbin.");
    });

    it("keeps an artist or film out without a note", () => {
      const reason = renderReason({ ...like, because: [...like.because, band] }, { drivers: ["Lilia"], tags: [] }, context);
      expect(reason).toBe("Like Via Carota: Italian, warm and stylish.");
    });

    it("never takes a plain driver as the favorite", () => {
      const plain = { ...place, because: [{ name: "Your places", share: 60, entityId: "advisor", tags: ["Warm", "Cozy"] }, ...place.because] };
      expect(renderReason(plain, { drivers: ["Via Carota"], tags: [] }, context)).toBe("Because Ana loves Via Carota.");
    });
  });

  describe("without a tag line", () => {
    const band = { name: "Khruangbin", share: 30, entityId: "e-band", media: true };
    const withBand = { ...place, because: [band, ...place.because], mediaNote: { name: "Khruangbin" } };

    it("falls back to the favorites sentence", () => {
      expect(renderReason(place, { drivers: ["Via Carota"], tags: ["Cozy"], fact: "Known for its natural wine list" }, context)).toBe(
        "Because Ana loves Via Carota; it shares cozy; known for its natural wine list.",
      );
    });

    it("adds an artist or film the sentence does not name", () => {
      expect(renderReason(withBand, { drivers: ["Via Carota"], tags: [] }, context)).toBe(
        "Because Ana loves Via Carota. Also fits Ana's love of Khruangbin.",
      );
    });

    it("does not say it twice", () => {
      expect(renderReason(withBand, { drivers: ["Khruangbin", "Via Carota"], tags: [] }, context)).toBe(
        "Because Ana loves Khruangbin and Via Carota.",
      );
    });
  });

  it("keeps a snippet that starts with a name as it is", () => {
    expect(snippetClause("Senhor Uva pours low intervention wines", ["Senhor Uva"])).toBe(
      "Senhor Uva pours low intervention wines",
    );
    expect(snippetClause("Known for its natural wine list", [])).toBe("known for its natural wine list");
    expect(snippetClause("Lisbon's oldest wine bar", ["Lisbon"])).toBe("Lisbon's oldest wine bar");
  });

  it("writes tags mid sentence", () => {
    expect(tagPhrase("Cozy")).toBe("cozy");
    expect(tagPhrase("Natural Wine")).toBe("natural wine");
    expect(tagPhrase("Italian")).toBe("Italian");
    expect(listOf(["a", "b", "c"])).toBe("a, b and c");
  });

  it("picks in code when the model gave nothing: top favorites and tags, no snippet", () => {
    expect(defaultPick(place)).toEqual({ drivers: ["Via Carota", "Lilia"], tags: ["Cozy", "Italian"] });
    expect(defaultPick({ ...place, because: [{ name: "Other favorites", share: 100, entityId: "other" }] })).toBeNull();
  });
});

describe("factSnippets", () => {
  it("keeps short verbatim sentences without dashes or quotes", () => {
    const snippets = factSnippets([
      "A tiny bar in Estrela. Known for its natural wine list! It was voted \u201cbest\u201d bar \u2014 twice.",
      "A tiny bar in Estrela.",
    ]);
    expect(snippets).toEqual(["A tiny bar in Estrela", "Known for its natural wine list"]);
  });
});

describe("parsePicks", () => {
  it("reads the picks out of a fenced reply and skips bad entries", () => {
    const text =
      'Here:\n```json\n{"reasons":[{"place_id":"tp-1","drivers":["Lilia"],"tags":[],"fact":1},{"place_id":2},{"place_id":"tp-2","reason":"free lobster"}]}\n```';
    expect(parsePicks(text)).toEqual([
      { place_id: "tp-1", drivers: ["Lilia"], tags: [], fact: 1 },
      { place_id: "tp-2" },
    ]);
  });

  it("returns nothing for a reply that is not the expected shape", () => {
    expect(parsePicks("no json here")).toEqual([]);
    expect(parsePicks('{"reasons":"nope"}')).toEqual([]);
  });
});
