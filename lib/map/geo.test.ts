import { describe, expect, it } from "vitest";

import {
  boundsForCamera,
  cameraForBounds,
  fitBoundsFor,
  movedFar,
  offscreenDirection,
  offsetCenter,
  project,
  radiusFromViewport,
  toScreen,
  unproject,
} from "./geo";

const lisbon = { lat: 38.7139, lon: -9.1394 };
const size = { width: 1000, height: 660 };

describe("project / unproject", () => {
  it("round trips", () => {
    const p = unproject(project(lisbon, 14), 14);
    expect(p.lat).toBeCloseTo(lisbon.lat, 9);
    expect(p.lon).toBeCloseTo(lisbon.lon, 9);
  });

  it("doubles the pixel distance per zoom level", () => {
    const a = project(lisbon, 10);
    const b = project(lisbon, 11);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
  });
});

describe("fitBoundsFor", () => {
  it("returns null without coordinates", () => {
    expect(fitBoundsFor([])).toBeNull();
    expect(fitBoundsFor([{ lat: undefined, lon: 1 }, {}])).toBeNull();
  });

  it("wraps every located place and skips the rest", () => {
    const b = fitBoundsFor([
      { lat: 38.71, lon: -9.15 },
      { lat: 38.73, lon: -9.13 },
      { lat: undefined, lon: undefined },
    ]);
    expect(b).toEqual({ north: 38.73, south: 38.71, east: -9.13, west: -9.15 });
  });

  it("gives a single place a small box instead of a point", () => {
    const b = fitBoundsFor([lisbon]);
    expect(b).not.toBeNull();
    expect(b!.north - b!.south).toBeCloseTo(0.004, 9);
    expect(b!.east - b!.west).toBeCloseTo(0.004, 9);
    expect((b!.north + b!.south) / 2).toBeCloseTo(lisbon.lat, 9);
  });
});

describe("cameraForBounds", () => {
  it("fits the bounds inside the padded viewport", () => {
    const bounds = { north: 38.725, south: 38.705, east: -9.13, west: -9.16 };
    const camera = cameraForBounds(bounds, size, { padding: 64 });
    const ne = toScreen(camera, size, { lat: bounds.north, lon: bounds.east });
    const sw = toScreen(camera, size, { lat: bounds.south, lon: bounds.west });
    // One axis touches the padding exactly, the other has room.
    expect(ne.x).toBeLessThanOrEqual(size.width - 64 + 1e-6);
    expect(sw.x).toBeGreaterThanOrEqual(64 - 1e-6);
    expect(ne.y).toBeGreaterThanOrEqual(64 - 1e-6);
    expect(sw.y).toBeLessThanOrEqual(size.height - 64 + 1e-6);
    const touchesX = Math.abs(sw.x - 64) < 1e-6;
    const touchesY = Math.abs(ne.y - 64) < 1e-6;
    expect(touchesX || touchesY).toBe(true);
  });

  it("keeps uneven padding free, as for the preview card on the right", () => {
    const bounds = { north: 38.725, south: 38.705, east: -9.13, west: -9.16 };
    const padding = { top: 64, right: 384, bottom: 64, left: 64 };
    const camera = cameraForBounds(bounds, size, { padding });
    const ne = toScreen(camera, size, { lat: bounds.north, lon: bounds.east });
    const sw = toScreen(camera, size, { lat: bounds.south, lon: bounds.west });
    expect(ne.x).toBeLessThanOrEqual(size.width - 384 + 1e-6);
    expect(sw.x).toBeGreaterThanOrEqual(64 - 1e-6);
    expect((ne.x + sw.x) / 2).toBeCloseTo((64 + size.width - 384) / 2, 6);
  });

  it("caps the zoom", () => {
    const camera = cameraForBounds({ north: 38.7140, south: 38.7139, east: -9.1393, west: -9.1394 }, size, { maxZoom: 16 });
    expect(camera.zoom).toBe(16);
  });
});

describe("boundsForCamera", () => {
  it("is centered on the camera", () => {
    const b = boundsForCamera({ ...lisbon, zoom: 14 }, size);
    expect(b.north).toBeGreaterThan(lisbon.lat);
    expect(b.south).toBeLessThan(lisbon.lat);
    expect((b.east + b.west) / 2).toBeCloseTo(lisbon.lon, 9);
  });
});

describe("radiusFromViewport", () => {
  it("uses half the shorter side, rounded to 50 m", () => {
    const b = boundsForCamera({ ...lisbon, zoom: 14 }, size);
    const r = radiusFromViewport(b);
    expect(r % 50).toBe(0);
    // About 7.46 m per px at zoom 14 near Lisbon: half of 660 px is about 2.46 km.
    expect(r).toBeGreaterThanOrEqual(2400);
    expect(r).toBeLessThanOrEqual(2500);
  });

  it("stays between 200 m and 50 km", () => {
    expect(radiusFromViewport(boundsForCamera({ ...lisbon, zoom: 21 }, size))).toBe(200);
    expect(radiusFromViewport(boundsForCamera({ ...lisbon, zoom: 3 }, size))).toBe(50_000);
  });
});

describe("movedFar", () => {
  const start = { ...lisbon, zoom: 14 };

  function panned(dx: number, dy: number) {
    return { ...offsetCenter(start, start.zoom, dx, dy), zoom: start.zoom };
  }

  it("ignores a small pan or a small zoom", () => {
    expect(movedFar(start, start, size)).toBe(false);
    expect(movedFar(start, panned(100, 80), size)).toBe(false);
    expect(movedFar(start, { ...start, zoom: 14.5 }, size)).toBe(false);
  });

  it("counts a pan of 40% of the shorter side, on either axis", () => {
    expect(movedFar(start, panned(250, 0), size)).toBe(false);
    expect(movedFar(start, panned(270, 0), size)).toBe(true);
    expect(movedFar(start, panned(0, -270), size)).toBe(true);
    expect(movedFar(start, panned(200, 200), size)).toBe(true);
  });

  it("counts one zoom level, in or out", () => {
    expect(movedFar(start, { ...start, zoom: 15 }, size)).toBe(true);
    expect(movedFar(start, { ...start, zoom: 13 }, size)).toBe(true);
    // The zoom buttons add 1 to a fractional fit zoom.
    expect(movedFar({ ...start, zoom: 13.37 }, { ...start, zoom: 13.37 + 1 }, size)).toBe(true);
  });

  it("measures the pan at the current zoom, so a pan that looks small when zoomed out is small", () => {
    const from = { ...offsetCenter(start, 18, 270, 0), zoom: 14 };
    expect(movedFar(from, start, size)).toBe(false);
  });
});

describe("offsetCenter", () => {
  it("moves the center by screen pixels", () => {
    const c = offsetCenter(lisbon, 14, 200, 0);
    const p = toScreen({ ...c, zoom: 14 }, size, lisbon);
    expect(p.x).toBeCloseTo(size.width / 2 - 200, 6);
    expect(p.y).toBeCloseTo(size.height / 2, 6);
  });
});

describe("offscreenDirection", () => {
  const camera = { ...lisbon, zoom: 15 };

  it("is null for a place on screen", () => {
    expect(offscreenDirection(camera, lisbon, size)).toBeNull();
  });

  it("points west for a place to the left and pins the chip to the left edge", () => {
    const west = offsetCenter(lisbon, 15, -900, 0);
    const d = offscreenDirection(camera, west, size, 24);
    expect(d).not.toBeNull();
    expect(d!.compass).toBe("west");
    expect(d!.angle).toBeCloseTo(270, 3);
    expect(d!.x).toBeCloseTo(24, 6);
    expect(d!.y).toBeCloseTo(size.height / 2, 6);
  });

  it("points north-east along the ray and stays inside the viewport", () => {
    const ne = offsetCenter(lisbon, 15, 2000, -2000);
    const d = offscreenDirection(camera, ne, size, 24);
    expect(d!.compass).toBe("north-east");
    expect(d!.y).toBeCloseTo(24, 6);
    expect(d!.x).toBeGreaterThan(size.width / 2);
    expect(d!.x).toBeLessThanOrEqual(size.width - 24);
  });

  it("treats the area under a card as hidden and puts the chip at the card's edge", () => {
    const right = { top: 24, right: 384, bottom: 24, left: 24 };
    const underCard = offsetCenter(lisbon, 15, 350, 0);
    expect(offscreenDirection(camera, underCard, size, 24)).toBeNull();
    const d = offscreenDirection(camera, underCard, size, right);
    expect(d!.compass).toBe("east");
    expect(d!.x).toBeCloseTo(size.width - 384, 6);
  });

  it("returns direction only, no distance", () => {
    const d = offscreenDirection(camera, offsetCenter(lisbon, 15, 0, 5000), size);
    expect(Object.keys(d!).sort()).toEqual(["angle", "compass", "x", "y"]);
    expect(d!.compass).toBe("south");
  });
});
