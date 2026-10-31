"use client";

import { useEffect, type RefObject } from "react";

import { TRIP_PLACE_TYPE } from "../workspace/dnd";

// Scrolls the itinerary while a place is held near its top or bottom. The
// browser's own edge scroll only wakes in a few pixels at the very edge, so
// this band is tall, and it runs on past the edge: the pointer over the panel
// header above the list still scrolls up. Speed grows toward the edge and over
// the first moments of the hold, so aiming at a row near the edge is not
// pulled away from under the pointer.

const ZONE = 110;
const MAX_SPEED = 900;
const RAMP_MS = 350;
// dragover stops when the drag leaves the window, and nothing says so.
const STALE_MS = 400;

/** Pixels a second for a pointer at `y`: negative up, positive down, 0 away from both edges. */
export function edgeScrollSpeed(y: number, top: number, bottom: number, zone = ZONE, max = MAX_SPEED): number {
  // On a short list the two bands never meet, so the middle stays still.
  const band = Math.min(zone, (bottom - top) / 3);
  const depth = Math.max(top + band - y, y - (bottom - band));
  if (depth <= 0) return 0;
  const speed = max * Math.min(1, depth / band) ** 1.5;
  return y < (top + bottom) / 2 ? -speed : speed;
}

export function useDragEdgeScroll(scroller: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let speed = 0;
    let since = 0;
    let lastOver = 0;
    let lastFrame = 0;
    let carry = 0;

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      speed = 0;
      carry = 0;
    };

    const tick = (now: number) => {
      const el = scroller.current;
      if (!el || now - lastOver > STALE_MS) return stop();
      const ramp = Math.min(1, (now - since) / RAMP_MS);
      carry += (speed * ramp * Math.max(0, now - lastFrame)) / 1000;
      lastFrame = now;
      // scrollTop drops fractions, which would lose the slow start of a hold.
      const whole = Math.trunc(carry);
      el.scrollTop += whole;
      carry -= whole;
      frame = requestAnimationFrame(tick);
    };

    const onDragOver = (e: DragEvent) => {
      const el = scroller.current;
      if (!el || !e.dataTransfer?.types.includes(TRIP_PLACE_TYPE)) return;
      const box = el.getBoundingClientRect();
      const inList = e.clientX >= box.left && e.clientX <= box.right;
      const next = inList ? edgeScrollSpeed(e.clientY, box.top, box.bottom) : 0;
      if (next === 0) return stop();
      lastOver = performance.now();
      if (Math.sign(next) !== Math.sign(speed)) since = lastOver;
      speed = next;
      if (frame) return;
      lastFrame = lastOver;
      frame = requestAnimationFrame(tick);
    };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragend", stop);
    document.addEventListener("drop", stop);
    return () => {
      stop();
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragend", stop);
      document.removeEventListener("drop", stop);
    };
  }, [scroller, enabled]);
}
