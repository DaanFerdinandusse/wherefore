import { describe, expect, it } from "vitest";

import { MAX_TASTE_SIGNALS, tasteSignals } from "../taste";

describe("tasteSignals", () => {
  it("uses resolved favorites only, in the advisor's order, each once", () => {
    const signals = tasteSignals([
      { entityId: "LILIA", match: "resolved", position: 1 },
      { entityId: "VIA", match: "resolved", position: 0 },
      { entityId: null, match: "unmatched", position: 2 },
      { entityId: "WEAK", match: "weak", position: 3 },
      { entityId: "VIA", match: "resolved", position: 4 },
      { entityId: "ATTABOY", match: "resolved", position: 5 },
    ]);
    expect(signals).toEqual(["VIA", "LILIA", "ATTABOY"]);
  });

  it("is empty without resolved favorites and capped with many", () => {
    expect(tasteSignals([])).toEqual([]);
    const many = Array.from({ length: 40 }, (_, i) => ({ entityId: `E${i}`, match: "resolved", position: i }));
    expect(tasteSignals(many)).toHaveLength(MAX_TASTE_SIGNALS);
  });
});
