"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { cameraForBounds, offsetCenter, project, toScreen, type Camera } from "@/lib/map/geo";

import { clampZoom, FIT_MAX_ZOOM, type MapEngine, type MoveCause, type SurfaceProps } from "./surface";

// The map without map tiles: the same pins in their real positions (Web
// Mercator, same scale as the live map) over a warm hairline grid. Drag pans,
// the zoom buttons zoom. Used while the map cannot load and in the map lab.

const GRID = 64;
const DRAG_SLOP = 4;
/** Pins further than this outside the view are not drawn. */
const CULL = 160;

export function StaticSurface({
  initialCamera,
  size,
  pins,
  renderPin,
  pinTitle,
  onReady,
  onCamera,
  onPinEnter,
  onPinLeave,
  onPinClick,
  onPinDoubleClick,
  onBackgroundClick,
}: SurfaceProps) {
  const [camera, setCamera] = useState<Camera>(initialCamera);
  const cameraRef = useRef(initialCamera);
  const sizeRef = useRef(size);
  const onCameraRef = useRef(onCamera);
  const drag = useRef<{ x: number; y: number; start: Camera; moved: boolean; pointerId: number } | null>(null);

  useEffect(() => {
    sizeRef.current = size;
    onCameraRef.current = onCamera;
  });

  useEffect(() => {
    const move = (next: Camera, cause: MoveCause) => {
      cameraRef.current = next;
      setCamera(next);
      onCameraRef.current(next, cause, true);
    };
    const engine: MapEngine = {
      fit: (bounds, fallback, padding) =>
        move(bounds ? cameraForBounds(bounds, sizeRef.current, { padding, maxZoom: FIT_MAX_ZOOM }) : fallback, "fit"),
      panTo: (p) => move({ ...cameraRef.current, lat: p.lat, lon: p.lon }, "pan"),
      moveTo: (c) => move(c, "pan"),
      zoomBy: (delta) => move({ ...cameraRef.current, zoom: clampZoom(cameraRef.current.zoom + delta) }, "user"),
    };
    onReady(engine);
    // The engine reads refs, so it is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, start: cameraRef.current, moved: false, pointerId: e.pointerId };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const center = offsetCenter(d.start, d.start.zoom, -dx, -dy);
    const next = { ...d.start, lat: center.lat, lon: center.lon };
    cameraRef.current = next;
    setCamera(next);
    onCamera(next, "user", false);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.moved) onCamera(cameraRef.current, "user", true);
    else if (e.target === e.currentTarget) onBackgroundClick();
  }

  const world = project(camera, camera.zoom);
  const gridX = -((world.x - size.width / 2) % GRID);
  const gridY = -((world.y - size.height / 2) % GRID);

  return (
    <div
      data-testid="static-map"
      data-camera={`${camera.lat.toFixed(5)},${camera.lon.toFixed(5)},${camera.zoom.toFixed(2)}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      style={{
        backgroundImage:
          "linear-gradient(var(--color-rule) 1px, transparent 1px), linear-gradient(90deg, var(--color-rule) 1px, transparent 1px)",
        backgroundSize: `${GRID}px ${GRID}px`,
        backgroundPosition: `${gridX}px ${gridY}px`,
      }}
      className="absolute inset-0 isolate cursor-grab touch-none overflow-hidden bg-canvas select-none active:cursor-grabbing"
    >
      {pins.map((pin) => {
        const p = toScreen(camera, size, pin);
        if (p.x < -CULL || p.y < -CULL || p.x > size.width + CULL || p.y > size.height + CULL) return null;
        return (
          <button
            key={pin.id}
            type="button"
            aria-label={pinTitle(pin)}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => onPinEnter(pin.id)}
            onPointerLeave={() => onPinLeave(pin.id)}
            onFocus={() => onPinEnter(pin.id)}
            onBlur={() => onPinLeave(pin.id)}
            onClick={() => onPinClick(pin.id)}
            onDoubleClick={() => onPinDoubleClick(pin.id)}
            style={{ left: p.x, top: p.y, zIndex: pin.zIndex }}
            className="absolute block -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-pill"
          >
            {renderPin(pin)}
          </button>
        );
      })}
    </div>
  );
}
