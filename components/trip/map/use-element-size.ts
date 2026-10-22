"use client";

import { useCallback, useEffect, useState } from "react";

import type { ViewportSize } from "@/lib/map/geo";

/**
 * Measures an element: once when it attaches (ResizeObserver callbacks wait
 * for a rendering step, which a background tab may not get), then on every
 * resize. A hidden element (zero size, as when the workspace shows the board)
 * keeps its last real size, so the map stays mounted and does not reload.
 * Pass the returned callback as `ref`.
 */
export function useElementSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });

  const update = useCallback((width: number, height: number) => {
    setSize((s) => {
      if (width === 0 || height === 0) return s;
      return s.width === width && s.height === height ? s : { width, height };
    });
  }, []);

  const ref = useCallback(
    (node: T | null) => {
      setElement(node);
      if (node) update(node.clientWidth, node.clientHeight);
    },
    [update],
  );

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width, entry.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, update]);

  return [ref, size] as const;
}
