// Declutter for the Discover map: which suggested places keep their photo pin
// and which collapse to a score dot, and which numbered itinerary pins have
// room for their name. Zoomed out below `dotBelowZoom`, every suggested pin
// is a dot. Above it, pins are placed in priority order and a photo pin that
// would overlap a pin already placed collapses to a dot. Pins the advisor is
// looking at (selected, highlighted) always keep their photo.

import { project } from "./geo";

export type PinVisual = "photo" | "number" | "dot";

export type DeclutterPin = {
  id: string;
  lat: number;
  lon: number;
  kind: "suggested" | "itinerary";
  /** Higher places first and wins overlaps. */
  priority: number;
  /** Selected or highlighted: never collapses. */
  keepPhoto?: boolean;
  /** Diameter of the main disc in px (photo for suggested, number disc for itinerary). */
  size: number;
  /** Itinerary pins show it next to the number when there is room. */
  name?: string;
};

export type DeclutterResult = Record<string, { visual: PinVisual; showName: boolean }>;

export const DOT_BELOW_ZOOM = 13;
export const NAME_FROM_ZOOM = 14;

type Box = { x0: number; y0: number; x1: number; y1: number };

const GAP = 4;
/** The score chip hangs about this far below a photo pin. */
const CHIP_DROP = 12;

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 + GAP && a.x1 + GAP > b.x0 && a.y0 < b.y1 + GAP && a.y1 + GAP > b.y0;
}

function centered(x: number, y: number, size: number, drop = 0): Box {
  return { x0: x - size / 2, y0: y - size / 2, x1: x + size / 2, y1: y + size / 2 + drop };
}

/** Rough width of the name pill next to a number pin (13 px text, 10 px padding). */
export function nameLabelWidth(name: string): number {
  return 20 + Math.ceil(name.length * 7);
}

export function declutter(
  pins: DeclutterPin[],
  zoom: number,
  { dotBelowZoom = DOT_BELOW_ZOOM, nameFromZoom = NAME_FROM_ZOOM }: { dotBelowZoom?: number; nameFromZoom?: number } = {},
): DeclutterResult {
  const ordered = [...pins].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const placed: Box[] = [];
  const result: DeclutterResult = {};

  for (const pin of ordered) {
    const { x, y } = project(pin, zoom);

    if (pin.kind === "itinerary") {
      placed.push(centered(x, y, pin.size));
      let showName = false;
      if (pin.name && zoom >= nameFromZoom) {
        const label: Box = { x0: x + pin.size / 2 + 6, y0: y - 12, x1: x + pin.size / 2 + 6 + nameLabelWidth(pin.name), y1: y + 12 };
        showName = !placed.slice(0, -1).some((b) => overlaps(label, b));
        if (showName) placed.push(label);
      }
      result[pin.id] = { visual: "number", showName };
      continue;
    }

    if (pin.keepPhoto) {
      placed.push(centered(x, y, pin.size, CHIP_DROP));
      result[pin.id] = { visual: "photo", showName: false };
      continue;
    }

    if (zoom < dotBelowZoom) {
      result[pin.id] = { visual: "dot", showName: false };
      continue;
    }

    const box = centered(x, y, pin.size, CHIP_DROP);
    if (placed.some((b) => overlaps(box, b))) {
      result[pin.id] = { visual: "dot", showName: false };
    } else {
      placed.push(box);
      result[pin.id] = { visual: "photo", showName: false };
    }
  }

  return result;
}
