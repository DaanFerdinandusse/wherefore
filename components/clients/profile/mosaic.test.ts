import { describe, expect, it } from "vitest";

import { layoutMosaic, type MosaicShape } from "./mosaic";

const shape = (item: { shape: MosaicShape }) => item.shape;
const places = (n: number) => Array.from({ length: n }, () => ({ shape: "place" as MosaicShape }));

describe("layoutMosaic", () => {
  it("is empty without items", () => {
    expect(layoutMosaic([], shape)).toEqual([]);
  });

  it("alternates rows of two and three with the design's ratios", () => {
    const rows = layoutMosaic(places(5), shape);
    expect(rows.map((row) => row.cells.map((cell) => cell.ratio))).toEqual([
      [1, 1.5],
      [1, 1.5, 1],
    ]);
    expect(rows.map((row) => row.spacer)).toEqual([0, 0]);
    expect(rows.flatMap((row) => row.cells.map((cell) => cell.index))).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps a short last row at full height with an empty spacer", () => {
    const rows = layoutMosaic(places(3), shape);
    expect(rows[1].cells.map((cell) => cell.ratio)).toEqual([1]);
    expect(rows[1].spacer).toBe(2.5);
    expect(layoutMosaic(places(1), shape)[0].spacer).toBe(1.5);
  });

  it("draws an artist square and a film as a poster in any slot", () => {
    const rows = layoutMosaic([{ shape: "place" }, { shape: "artist" }, { shape: "film" }] as { shape: MosaicShape }[], shape);
    expect(rows[0].cells.map((cell) => cell.ratio)).toEqual([1, 1]);
    expect(rows[1].cells[0].ratio).toBeCloseTo(2 / 3);
  });
});
