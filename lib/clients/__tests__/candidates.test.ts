import { describe, expect, it } from "vitest";

import {
  addMedia,
  candidateDetail,
  interleave,
  toFavoriteCandidate,
  toMediaFavorite,
  unmatchedCandidates,
  type SearchCandidate,
} from "../candidates";

const devocion: SearchCandidate = {
  entityId: "D1",
  name: "Devoción",
  address: "69 Grand St, Brooklyn",
  lat: 40.71,
  lon: -73.96,
  imageUrl: "https://images.qloo.com/d1.jpg",
};

describe("favorite candidate mapping", () => {
  it("keeps only the fields the no match tile shows", () => {
    const wide = { ...devocion, tags: [{ tagId: "t", name: "Coffee" }], googlePlaceId: "g" } as SearchCandidate;
    expect(toFavoriteCandidate(wide)).toEqual(devocion);
  });

  it("drops coordinates unless both are present and skips empty fields", () => {
    expect(toFavoriteCandidate({ entityId: "X", name: "X", lat: 1 })).toEqual({ entityId: "X", name: "X" });
  });

  it("keeps the first three distinct results for an unmatched favorite", () => {
    const results = [devocion, devocion, { entityId: "D2", name: "Devoción Flatiron" }, { entityId: "D3", name: "C" }, { entityId: "D4", name: "D" }];
    expect(unmatchedCandidates(results).map((c) => c.entityId)).toEqual(["D1", "D2", "D3"]);
  });

  it("uses the address, else the disambiguation, as the detail line", () => {
    expect(candidateDetail(devocion)).toBe("69 Grand St, Brooklyn");
    expect(candidateDetail({ entityId: "K", name: "Khruangbin", disambiguation: "Band" })).toBe("Band");
    expect(candidateDetail({ entityId: "K", name: "K" })).toBe("");
  });
});

describe("media favorites", () => {
  const artist: SearchCandidate = { entityId: "A1", name: "Khruangbin", imageUrl: "https://images.qloo.com/k.jpg" };

  it("maps a pick to a stored media favorite", () => {
    expect(toMediaFavorite(artist, "artist", " khru ")).toEqual({
      query: "khru",
      kind: "artist",
      entityId: "A1",
      name: "Khruangbin",
      imageUrl: "https://images.qloo.com/k.jpg",
    });
  });

  it("adds each entity once", () => {
    const one = addMedia([], toMediaFavorite(artist, "artist", "k"));
    expect(addMedia(one, toMediaFavorite(artist, "artist", "kh"))).toHaveLength(1);
  });

  it("interleaves result lists by rank", () => {
    expect(interleave([["a1", "a2", "a3"], ["m1"]])).toEqual(["a1", "m1", "a2", "a3"]);
  });
});
