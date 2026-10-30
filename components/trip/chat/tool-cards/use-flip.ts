"use client";

import { useLayoutEffect, useRef } from "react";

// Slides list items from where they were to where a new order or layout puts
// them, so a rejected place sinks to the back of its card and the rows fold
// into a row of chips. Positions are read relative to the list, so scrolling
// the chat does not count as a move. Items carry `data-flip-id`.

const DURATION_MS = 620;
const STAGGER_MS = 28;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function useFlip<T extends HTMLElement>(key: string) {
  const list = useRef<T>(null);
  const positions = useRef(new Map<string, { left: number; top: number }>());

  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const origin = element.getBoundingClientRect();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, { left: number; top: number }>();
    const moving: Animation[] = [];

    const items = [...element.querySelectorAll<HTMLElement>(":scope > [data-flip-id]")];
    const offsets = items.map((item) => item.getBoundingClientRect());
    items.forEach((item, index) => {
      const rect = offsets[index]!;
      const here = { left: rect.left - origin.left, top: rect.top - origin.top };
      next.set(item.dataset.flipId!, here);
      const was = positions.current.get(item.dataset.flipId!);
      if (!was || reduced) return;
      const dx = was.left - here.left;
      const dy = was.top - here.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      moving.push(
        item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: DURATION_MS,
          delay: index * STAGGER_MS,
          easing: EASE,
          fill: "backwards",
        }),
      );
    });
    positions.current = next;
    if (moving.length === 0) return;

    // A scrolling row of chips would clip the places sliding into it.
    element.setAttribute("data-flipping", "");
    void Promise.allSettled(moving.map((animation) => animation.finished)).then(() => element.removeAttribute("data-flipping"));
  }, [key]);
  return list;
}
