import { describe, expect, it } from "vitest";

import { findCard, moveCard, restoreCard, STAGE_COLUMNS, totalTrips } from "./columns";
import { board, tripCard } from "./fixtures";

describe("stage columns", () => {
  it("lists the four stages in board order", () => {
    expect(STAGE_COLUMNS.map((c) => c.stage)).toEqual(["planning", "shared", "traveling", "done"]);
  });
});

describe("moveCard", () => {
  const a = tripCard({ id: "a" });
  const b = tripCard({ id: "b" });
  const c = tripCard({ id: "c", stage: "done" });
  const grouped = board([a, b, c]);

  it("moves a card to the top of the target column with the new stage", () => {
    const next = moveCard(grouped, "b", "done");
    expect(next.planning.map((t) => t.id)).toEqual(["a"]);
    expect(next.done.map((t) => t.id)).toEqual(["b", "c"]);
    expect(findCard(next, "b")?.stage).toBe("done");
    expect(totalTrips(next)).toBe(3);
  });

  it("returns the same board for a drop on the same column or an unknown id", () => {
    expect(moveCard(grouped, "a", "planning")).toBe(grouped);
    expect(moveCard(grouped, "missing", "done")).toBe(grouped);
  });

  it("restores a card after a failed move", () => {
    const moved = moveCard(grouped, "a", "shared");
    const restored = restoreCard(moved, a);
    expect(restored.shared).toEqual([]);
    expect(restored.planning.map((t) => t.id)).toEqual(["a", "b"]);
    expect(findCard(restored, "a")?.stage).toBe("planning");
  });
});
