// The photo grid of "Places Ana loves" (C2) as plain data: rows of two
// large photos (a square and a wide one), then three smaller ones (square,
// wide, square), repeating. Every cell's width is its aspect ratio, so the
// photos in a row share one height. An artist is always a square (drawn as a
// circle), a film a poster. A short last row keeps the row height by leaving
// the missing slots empty. Pure.

export type MosaicShape = "place" | "artist" | "film";

export type MosaicCell<T> = {
  item: T;
  /** Position in the original list (for drag and keyboard moves). */
  index: number;
  /** Width over height. */
  ratio: number;
};

export type MosaicRow<T> = {
  cells: MosaicCell<T>[];
  /** Ratio of the empty space at the end of a short last row, 0 otherwise. */
  spacer: number;
};

/** Slot ratios per row, repeating. */
export const ROW_PATTERN: readonly (readonly number[])[] = [
  [1, 1.5],
  [1, 1.5, 1],
];

const SHAPE_RATIO: Record<Exclude<MosaicShape, "place">, number> = { artist: 1, film: 2 / 3 };

export function layoutMosaic<T>(items: readonly T[], shapeOf: (item: T) => MosaicShape): MosaicRow<T>[] {
  const rows: MosaicRow<T>[] = [];
  let index = 0;
  let pattern = 0;
  while (index < items.length) {
    const slots = ROW_PATTERN[pattern % ROW_PATTERN.length];
    const cells: MosaicCell<T>[] = [];
    for (const slot of slots) {
      if (index >= items.length) break;
      const item = items[index];
      const shape = shapeOf(item);
      cells.push({ item, index, ratio: shape === "place" ? slot : SHAPE_RATIO[shape] });
      index += 1;
    }
    const spacer = slots.slice(cells.length).reduce((sum, ratio) => sum + ratio, 0);
    rows.push({ cells, spacer });
    pattern += 1;
  }
  return rows;
}
