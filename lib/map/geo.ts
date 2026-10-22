// Pure map geometry for the Discover map: Web Mercator projection at a zoom
// level (the scale both the live map and the static fallback use), bounds,
// fitting, the search radius of a viewport and the direction toward a place
// that is off screen. No browser or map library here, so it is unit tested.

export type LatLon = { lat: number; lon: number };
export type Bounds = { north: number; south: number; east: number; west: number };
export type ViewportSize = { width: number; height: number };
export type Camera = { lat: number; lon: number; zoom: number };

const TILE = 256;
const EARTH_RADIUS_M = 6_371_000;
/** One place alone gets a small box around it instead of the closest zoom. */
const MIN_SPAN_DEG = 0.004;

function hasCoords<T extends { lat?: number; lon?: number }>(p: T): p is T & LatLon {
  return typeof p.lat === "number" && typeof p.lon === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lon);
}

/** World pixel coordinates of a point at a zoom level (256 px tiles). */
export function project(p: LatLon, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  const siny = Math.min(Math.max(Math.sin((p.lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: ((p.lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale,
  };
}

/** The inverse of `project`. */
export function unproject(pt: { x: number; y: number }, zoom: number): LatLon {
  const scale = TILE * 2 ** zoom;
  const lon = (pt.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * pt.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

/** Screen position of a point inside a viewport centered on the camera. */
export function toScreen(camera: Camera, size: ViewportSize, p: LatLon): { x: number; y: number } {
  const c = project({ lat: camera.lat, lon: camera.lon }, camera.zoom);
  const q = project(p, camera.zoom);
  return { x: q.x - c.x + size.width / 2, y: q.y - c.y + size.height / 2 };
}

/** The camera center after moving the view by a screen offset in px. */
export function offsetCenter(center: LatLon, zoom: number, dx: number, dy: number): LatLon {
  const c = project(center, zoom);
  return unproject({ x: c.x + dx, y: c.y + dy }, zoom);
}

/** Bounds around every place that has coordinates; null when none has. */
export function fitBoundsFor(places: { lat?: number; lon?: number }[]): Bounds | null {
  const located = places.filter(hasCoords);
  if (located.length === 0) return null;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const p of located) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lon);
    west = Math.min(west, p.lon);
  }
  if (north - south < MIN_SPAN_DEG) {
    const mid = (north + south) / 2;
    north = mid + MIN_SPAN_DEG / 2;
    south = mid - MIN_SPAN_DEG / 2;
  }
  if (east - west < MIN_SPAN_DEG) {
    const mid = (east + west) / 2;
    east = mid + MIN_SPAN_DEG / 2;
    west = mid - MIN_SPAN_DEG / 2;
  }
  return { north, south, east, west };
}

/** The visible bounds of a camera in a viewport (flat map, no tilt). */
export function boundsForCamera(camera: Camera, size: ViewportSize): Bounds {
  const c = project({ lat: camera.lat, lon: camera.lon }, camera.zoom);
  const nw = unproject({ x: c.x - size.width / 2, y: c.y - size.height / 2 }, camera.zoom);
  const se = unproject({ x: c.x + size.width / 2, y: c.y + size.height / 2 }, camera.zoom);
  return { north: nw.lat, south: se.lat, east: se.lon, west: nw.lon };
}

export type Padding = { top: number; right: number; bottom: number; left: number };

export function toPadding(padding: number | Padding): Padding {
  return typeof padding === "number" ? { top: padding, right: padding, bottom: padding, left: padding } : padding;
}

/**
 * The camera that shows the bounds inside the viewport with padding on every
 * side. Uneven padding (room for a card on the right) shifts the center.
 */
export function cameraForBounds(
  bounds: Bounds,
  size: ViewportSize,
  { padding = 64, maxZoom = 17, minZoom = 2 }: { padding?: number | Padding; maxZoom?: number; minZoom?: number } = {},
): Camera {
  const pad = toPadding(padding);
  const ne = project({ lat: bounds.north, lon: bounds.east }, 0);
  const sw = project({ lat: bounds.south, lon: bounds.west }, 0);
  const spanX = Math.max(ne.x - sw.x, 1e-9);
  const spanY = Math.max(sw.y - ne.y, 1e-9);
  const availX = Math.max(size.width - pad.left - pad.right, 1);
  const availY = Math.max(size.height - pad.top - pad.bottom, 1);
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.log2(availX / spanX), Math.log2(availY / spanY)));
  // Center the bounds in the padded box, then move the camera back to the viewport center.
  const mid = unproject({ x: (ne.x + sw.x) / 2, y: (ne.y + sw.y) / 2 }, 0);
  const center = offsetCenter(mid, zoom, (pad.right - pad.left) / 2, (pad.bottom - pad.top) / 2);
  return { lat: center.lat, lon: center.lon, zoom };
}

/** Great circle distance in meters. */
export function distanceM(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The search radius for "Search this area": the circle that fits inside the
 * viewport (half the shorter side), so results land on screen. Rounded to
 * 50 m and kept between 200 m and 50 km.
 */
export function radiusFromViewport(bounds: Bounds): number {
  const center = { lat: (bounds.north + bounds.south) / 2, lon: (bounds.east + bounds.west) / 2 };
  const halfHeight = distanceM(center, { lat: bounds.north, lon: center.lon });
  const halfWidth = distanceM(center, { lat: center.lat, lon: bounds.east });
  const radius = Math.round(Math.min(halfHeight, halfWidth) / 50) * 50;
  return Math.min(50_000, Math.max(200, radius));
}

export type Compass = "north" | "north-east" | "east" | "south-east" | "south" | "south-west" | "west" | "north-west";
const COMPASS: Compass[] = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

export type OffscreenDirection = {
  /** Screen angle in degrees, clockwise from straight up. */
  angle: number;
  compass: Compass;
  /** Where the chip sits: on the viewport edge, inset by the margin, along the ray to the place. */
  x: number;
  y: number;
};

/**
 * Direction toward a place that is outside the viewport, or null when it is
 * on screen. Direction only: never a distance. `margin` insets the visible
 * area on each side (a number for all four, or more on the side a card
 * covers); the test and the chip position both use that inset area.
 */
export function offscreenDirection(
  camera: Camera,
  place: LatLon,
  size: ViewportSize,
  margin: number | Padding = 24,
): OffscreenDirection | null {
  const m = toPadding(margin);
  const p = toScreen(camera, size, place);
  const x0 = m.left;
  const x1 = Math.max(size.width - m.right, x0 + 1);
  const y0 = m.top;
  const y1 = Math.max(size.height - m.bottom, y0 + 1);
  if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) return null;

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const compass = COMPASS[Math.round(angle / 45) % 8];

  // Scale the ray so it touches the inset rectangle.
  const t = Math.min(dx === 0 ? Infinity : (x1 - x0) / 2 / Math.abs(dx), dy === 0 ? Infinity : (y1 - y0) / 2 / Math.abs(dy));
  return { angle, compass, x: cx + dx * t, y: cy + dy * t };
}
