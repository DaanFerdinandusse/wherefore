import { describe, expect, it } from "vitest";

import { groupResults } from "./search-groups";
import type { EntityType, TypedCandidate } from "./use-entity-search";

const result = (type: EntityType, n: number): TypedCandidate => ({ entityId: `${type}-${n}`, name: `${type} ${n}`, type });

describe("groupResults", () => {
  it("puts places first, then artists, then films, each capped", () => {
    const interleaved = [0, 1, 2, 3, 4].flatMap((n) => [result("place", n), result("artist", n), result("movie", n)]);
    expect(groupResults(interleaved).map((r) => r.entityId)).toEqual([
      "place-0",
      "place-1",
      "place-2",
      "place-3",
      "artist-0",
      "artist-1",
      "movie-0",
      "movie-1",
    ]);
  });

  it("keeps what there is when a kind has no results", () => {
    expect(groupResults([result("movie", 0), result("artist", 0)]).map((r) => r.type)).toEqual(["artist", "movie"]);
    expect(groupResults([])).toEqual([]);
  });
});
