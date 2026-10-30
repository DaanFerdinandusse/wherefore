import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlaceChips, placeChipLabels } from "./place-chips";

describe("placeChipLabels", () => {
  it("shows Less known below the shared line and Michelin when the place has it", () => {
    expect(placeChipLabels({ popularity: 0.02, michelin: true })).toEqual(["Less known", "Michelin"]);
    expect(placeChipLabels({ popularity: 0.59 })).toEqual(["Less known"]);
    expect(placeChipLabels({ popularity: 0.97, michelin: true })).toEqual(["Michelin"]);
  });

  it("shows nothing for a well known place or an unknown popularity", () => {
    expect(placeChipLabels({ popularity: 0.6 })).toEqual([]);
    expect(placeChipLabels({})).toEqual([]);
  });
});

describe("PlaceChips", () => {
  it("renders nothing without a chip", () => {
    expect(renderToStaticMarkup(<PlaceChips place={{}} variant="tile" />)).toBe("");
  });

  it("never shows the number", () => {
    const html = renderToStaticMarkup(<PlaceChips place={{ popularity: 0.02, michelin: true }} variant="row" />);
    expect(html).toContain("Less known");
    expect(html).toContain("Michelin");
    expect(html).not.toContain("0.02");
  });
});
