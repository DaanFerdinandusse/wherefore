import { describe, expect, it } from "vitest";

import { edgeScrollSpeed } from "./drag-scroll";

describe("edgeScrollSpeed", () => {
  const top = 100;
  const bottom = 900;

  it("stands still away from both edges", () => {
    expect(edgeScrollSpeed(500, top, bottom)).toBe(0);
    expect(edgeScrollSpeed(top + 110, top, bottom)).toBe(0);
    expect(edgeScrollSpeed(bottom - 110, top, bottom)).toBe(0);
  });

  it("scrolls up near the top and down near the bottom", () => {
    expect(edgeScrollSpeed(top + 50, top, bottom)).toBeLessThan(0);
    expect(edgeScrollSpeed(bottom - 50, top, bottom)).toBeGreaterThan(0);
  });

  it("gets faster toward the edge", () => {
    expect(Math.abs(edgeScrollSpeed(top + 10, top, bottom))).toBeGreaterThan(Math.abs(edgeScrollSpeed(top + 80, top, bottom)));
  });

  it("keeps top speed past the edge, over the panel header", () => {
    expect(edgeScrollSpeed(top - 40, top, bottom)).toBe(edgeScrollSpeed(top, top, bottom));
    expect(edgeScrollSpeed(top, top, bottom)).toBe(-900);
    expect(edgeScrollSpeed(bottom + 40, top, bottom)).toBe(900);
  });

  it("leaves the middle of a short list still", () => {
    expect(edgeScrollSpeed(150, 0, 300)).toBe(0);
    expect(edgeScrollSpeed(50, 0, 300)).toBeLessThan(0);
    expect(edgeScrollSpeed(250, 0, 300)).toBeGreaterThan(0);
  });
});
