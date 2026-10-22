import { describe, expect, it } from "vitest";

import { OTHER_FAVORITES_ID } from "@/lib/qloo/normalize";

import { becauseLine, namedDrivers } from "./format";

describe("because line", () => {
  const because = [
    { entityId: OTHER_FAVORITES_ID, name: "Other favorites", share: 60 },
    { entityId: "e-via-carota", name: "Via Carota", share: 30 },
    { entityId: "e-lilia", name: "Lilia", share: 10 },
  ];

  it("names the top two real favorites, never the other favorites bucket", () => {
    expect(becauseLine(because, "Ana Ruiz")).toBe("Because Ana loves Via Carota and Lilia");
    expect(namedDrivers(because).map((d) => d.name)).toEqual(["Via Carota", "Lilia"]);
  });

  it("is empty when only the bucket is left", () => {
    expect(becauseLine([because[0]], "Ana Ruiz")).toBe("");
    expect(becauseLine([], "Ana Ruiz")).toBe("");
  });
});
