import { describe, expect, it } from "vitest";

import { groupByFields, mergePlaceRows } from "../mutations";

describe("groupByFields", () => {
  it("puts rows with different supplied fields in different upserts", () => {
    const groups = groupByFields(
      mergePlaceRows([
        { entityId: "a", name: "A", images: [{ url: "https://example.test/a.jpg" }] },
        { entityId: "b", name: "B" },
        { entityId: "c", name: "C", images: [] },
        { entityId: "d", name: "D", city: undefined },
      ]),
    );
    expect(groups.map((g) => [g.keys, g.rows.map((r) => r.entityId)])).toEqual([
      [["entityId", "images", "name"], ["a", "c"]],
      [["entityId", "name"], ["b", "d"]],
    ]);
  });
});
