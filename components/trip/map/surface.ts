import type { ReactNode } from "react";

import type { Bounds, Camera, LatLon, Padding, ViewportSize } from "@/lib/map/geo";
import type { PinModel } from "@/lib/map/pins";

// What TripMap needs from whatever draws the map: the live map or the static
// fallback. Both take the same pins and report camera moves with a cause, so
// "Search this region" only follows moves the advisor made.

export type MoveCause = "fit" | "pan" | "user";

export type MapEngine = {
  /** Fit the bounds inside the padding, or go to the fallback camera when there are none. */
  fit: (bounds: Bounds | null, fallback: Camera, padding: Padding) => void;
  panTo: (p: LatLon) => void;
  moveTo: (camera: Camera) => void;
  zoomBy: (delta: number) => void;
};

export type SurfaceProps = {
  initialCamera: Camera;
  size: ViewportSize;
  pins: PinModel[];
  renderPin: (pin: PinModel) => ReactNode;
  /** Accessible name of a pin. */
  pinTitle: (pin: PinModel) => string;
  onReady: (engine: MapEngine) => void;
  /** `settled` is false while a move is in progress (drag frames, animation). */
  onCamera: (camera: Camera, cause: MoveCause, settled: boolean) => void;
  onPinEnter: (id: string) => void;
  onPinLeave: (id: string) => void;
  onPinClick: (id: string) => void;
  onPinDoubleClick: (id: string) => void;
  onBackgroundClick: () => void;
};

export const FIT_PADDING = 64;
/** Fitting never zooms closer than this, so one place does not fill the map. */
export const FIT_MAX_ZOOM = 17;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function sameCamera(a: Camera | null | undefined, b: Camera | null | undefined): boolean {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6 && Math.abs(a.zoom - b.zoom) < 1e-3;
}
