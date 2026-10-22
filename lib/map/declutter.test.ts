import { describe, expect, it } from "vitest";

import { declutter, DOT_BELOW_ZOOM, type DeclutterPin } from "./declutter";
import { offsetCenter } from "./geo";

const origin = { lat: 38.7139, lon: -9.1394 };
const zoom = 15;

/** A pin placed `dx` px east of the origin at the test zoom. */
function pin(id: string, dx: number, extra: Partial<DeclutterPin> = {}): DeclutterPin {
  const p = offsetCenter(origin, zoom, dx, 0);
  return { id, lat: p.lat, lon: p.lon, kind: "suggested", priority: 50, size: 56, ...extra };
}

describe("declutter", () => {
  it("keeps photo pins that have room", () => {
    const r = declutter([pin("a", 0), pin("b", 200)], zoom);
    expect(r.a.visual).toBe("photo");
    expect(r.b.visual).toBe("photo");
  });

  it("collapses the lower priority pin of an overlapping pair to a dot", () => {
    const r = declutter([pin("low", 20, { priority: 10 }), pin("high", 0, { priority: 90 })], zoom);
    expect(r.high.visual).toBe("photo");
    expect(r.low.visual).toBe("dot");
  });

  it("turns every suggested pin into a dot when zoomed out", () => {
    const pins = [pin("a", 0), pin("b", 400)];
    const r = declutter(pins, DOT_BELOW_ZOOM - 0.5);
    expect(r.a.visual).toBe("dot");
    expect(r.b.visual).toBe("dot");
  });

  it("never collapses a selected or highlighted pin", () => {
    const pins = [pin("top", 0, { priority: 900 }), pin("kept", 10, { priority: 1, keepPhoto: true })];
    expect(declutter(pins, zoom).kept.visual).toBe("photo");
    expect(declutter(pins, DOT_BELOW_ZOOM - 3).kept.visual).toBe("photo");
  });

  it("keeps itinerary pins numbered at any zoom and blocks photos under them", () => {
    const pins = [pin("day1", 0, { kind: "itinerary", size: 28, priority: 400, name: "Buna" }), pin("near", 15)];
    const r = declutter(pins, zoom);
    expect(r.day1.visual).toBe("number");
    expect(r.near.visual).toBe("dot");
    expect(declutter(pins, 9).day1.visual).toBe("number");
  });

  it("shows an itinerary name only when zoomed in and the pill has room", () => {
    const alone = declutter([pin("day1", 0, { kind: "itinerary", size: 28, priority: 400, name: "Limantour" })], zoom);
    expect(alone.day1.showName).toBe(true);

    const far = declutter([pin("day1", 0, { kind: "itinerary", size: 28, priority: 400, name: "Limantour" })], 12);
    expect(far.day1.showName).toBe(false);

    const crowded = declutter(
      [
        pin("day1", 0, { kind: "itinerary", size: 28, priority: 400, name: "Buna" }),
        pin("day2", 50, { kind: "itinerary", size: 28, priority: 500, name: "Rosetta" }),
      ],
      zoom,
    );
    expect(crowded.day2.showName).toBe(true);
    expect(crowded.day1.showName).toBe(false);
  });

  it("is stable for equal priorities", () => {
    const r1 = declutter([pin("b", 10), pin("a", 0)], zoom);
    const r2 = declutter([pin("a", 0), pin("b", 10)], zoom);
    expect(r1).toEqual(r2);
    expect(r1.a.visual).toBe("photo");
    expect(r1.b.visual).toBe("dot");
  });
});
