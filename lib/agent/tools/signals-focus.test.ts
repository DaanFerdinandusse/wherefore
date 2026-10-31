import { describe, expect, it } from "vitest";

import type { Category } from "@/lib/contracts";

import { ASK_FAVORITE_TARGET, buildSignals, MAX_FAVORITE_SIGNALS, signalsForAsk, tagFit, type SignalFavorite, type SignalInputs } from "./signals";

const INDIAN = "urn:tag:genre:place:restaurant:indian";
const THAI = "urn:tag:genre:place:restaurant:thai";
const RESTAURANT = "urn:tag:category:place:restaurant";

function favorite(entityId: string, tagIds: string[], category: Category = "eat", clientId = "c1"): SignalFavorite {
  return { clientId, entityId, name: entityId, match: "resolved", tagIds, category };
}

function inputs(favorites: SignalFavorite[], extra: Partial<SignalInputs> = {}): SignalInputs {
  return { travelers: [{ name: "Ana", clientId: "c1", role: "client" }], favorites, ...extra };
}

const many = (prefix: string, count: number, tags: string[] = [], category: Category = "eat") =>
  Array.from({ length: count }, (_, i) => favorite(`${prefix}${i}`, tags, category));

describe("tagFit", () => {
  it("is strong on the tag itself", () => {
    expect(tagFit([INDIAN], [INDIAN])).toBe("strong");
  });

  it("is strong on the same word as a category, where the tag sits in another family", () => {
    expect(tagFit(["urn:tag:category:place:indian_restaurant"], [INDIAN])).toBe("strong");
  });

  it("is loose on the same word as a cuisine alone", () => {
    expect(tagFit(["urn:tag:cuisine:qloo:indian"], [INDIAN])).toBe("loose");
  });

  it("does not take a longer word for the same one", () => {
    expect(tagFit(["urn:tag:cuisine:qloo:north_indian", "urn:tag:genre:place:restaurant:modern_indian"], [INDIAN])).toBeNull();
  });

  it("does not read a word in an unrelated family", () => {
    expect(tagFit(["urn:tag:menu_highlight:qloo:indian"], [INDIAN])).toBeNull();
  });

  it("is null with nothing to compare", () => {
    expect(tagFit([], [INDIAN])).toBeNull();
    expect(tagFit([INDIAN], [])).toBeNull();
  });
});

describe("signalsForAsk", () => {
  it("puts tag matches first, strong before loose, and keeps favorite order inside each", () => {
    const list = [
      favorite("loose", ["urn:tag:cuisine:qloo:indian"]),
      favorite("bistro", []),
      favorite("rangoli", ["urn:tag:category:place:indian_restaurant"]),
      favorite("dishoom", [INDIAN]),
    ];
    const { signals } = signalsForAsk(inputs(list), { tagIds: [INDIAN], category: "eat" });
    expect(signals).toEqual(["rangoli", "dishoom", "loose", "bistro"]);
  });

  it("tops a thin match up to the target from the category before anything else", () => {
    const list = [
      ...many("museum", 8, [], "see"),
      favorite("dishoom", [INDIAN]),
      ...many("restaurant", 20),
    ];
    const { signals } = signalsForAsk(inputs(list), { tagIds: [INDIAN], category: "eat" });
    expect(signals).toHaveLength(ASK_FAVORITE_TARGET);
    expect(signals[0]).toBe("dishoom");
    expect(signals.some((id) => id.startsWith("museum"))).toBe(false);
  });

  it("falls back to the rest when the category runs out", () => {
    const list = [...many("museum", 8, [], "see"), favorite("dishoom", [INDIAN]), ...many("restaurant", 3)];
    const { signals } = signalsForAsk(inputs(list), { tagIds: [INDIAN], category: "eat" });
    expect(signals).toHaveLength(ASK_FAVORITE_TARGET);
    expect(signals.slice(0, 4)).toEqual(["dishoom", "restaurant0", "restaurant1", "restaurant2"]);
    expect(signals.filter((id) => id.startsWith("museum"))).toHaveLength(6);
  });

  it("lets tag matches pass the target, up to the favorites' room, with no top-up", () => {
    const list = [...many("thai", 30, [THAI]), ...many("other", 10)];
    const { signals } = signalsForAsk(inputs(list), { tagIds: [THAI], category: "eat" });
    expect(signals).toHaveLength(MAX_FAVORITE_SIGNALS);
    expect(signals.every((id) => id.startsWith("thai"))).toBe(true);
  });

  it("matches on category alone when the search names no tag", () => {
    const list = [...many("cafe", 4, [], "coffee"), ...many("restaurant", 12)];
    const { signals } = signalsForAsk(inputs(list), { tagIds: [], category: "eat" });
    expect(signals).toHaveLength(ASK_FAVORITE_TARGET);
    expect(signals.every((id) => id.startsWith("restaurant"))).toBe(true);
  });

  it("does not count a bare category filter as a tag match", () => {
    const list = [...many("restaurant", 15, [RESTAURANT])];
    const { signals } = signalsForAsk(inputs(list), { tagIds: [RESTAURANT], category: "eat" });
    expect(signals).toHaveLength(ASK_FAVORITE_TARGET);
  });

  it("keeps the trip's own signals with no tag and no category", () => {
    const given = inputs(many("place", 25));
    expect(signalsForAsk(given, { tagIds: [] })).toEqual(buildSignals(given));
    expect(signalsForAsk(given, { tagIds: [], category: "other" })).toEqual(buildSignals(given));
  });

  it("names only the favorites it used, so a card credits nothing else", () => {
    const list = [favorite("dishoom", [INDIAN]), ...many("restaurant", 30)];
    const out = signalsForAsk(inputs(list), { tagIds: [INDIAN], category: "eat" });
    expect(out.favorites.map((f) => f.entityId)).toEqual(out.signals);
    expect(out.favoritesUsed[0].names).toHaveLength(ASK_FAVORITE_TARGET);
  });

  it("gives every traveler room, each on their own matches", () => {
    const given: SignalInputs = {
      travelers: [
        { name: "Ana", clientId: "c1", role: "client" },
        { name: "Marc", clientId: "c2", role: "guest" },
      ],
      favorites: [...many("ana", 15, [THAI]), favorite("marc", [THAI], "eat", "c2")],
    };
    const out = signalsForAsk(given, { tagIds: [THAI], category: "eat" });
    expect(out.signals).toContain("marc");
    expect(out.companionsWithoutFavorites).toEqual([]);
  });

  it("only tops up with artists and films after the favorites of the category", () => {
    const given = inputs([favorite("dishoom", [INDIAN]), ...many("restaurant", 12)], {
      media: [{ clientId: "c1", entityId: "khruangbin", name: "Khruangbin", query: "Khruangbin" }],
    });
    const { signals } = signalsForAsk(given, { tagIds: [INDIAN], category: "eat" });
    expect(signals).not.toContain("khruangbin");
  });

  it("keeps itinerary picks and blended places after the focused favorites", () => {
    const given = inputs([favorite("dishoom", [INDIAN])], { tripPickEntityIds: ["pick"], advisorPlaceEntityIds: ["mine"], blendMyTaste: true });
    const out = signalsForAsk(given, { tagIds: [INDIAN], category: "eat" });
    expect(out.signals).toEqual(["dishoom", "mine", "pick"]);
    expect(out.tripPickSignals).toEqual(["pick"]);
    expect(out.advisorSignals).toEqual(["mine"]);
  });
});
