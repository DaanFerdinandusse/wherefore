import { describe, expect, it } from "vitest";

import type { tripAsks } from "@/lib/db/schema";
import { toAsk } from "../map";

const row: typeof tripAsks.$inferSelect = {
  id: "11111111-1111-4111-8111-111111111111", tripId: "trip", label: "Dinner",
  query: {}, target: null, toolCallId: "call", chatMessageId: null, status: "done",
  resultCount: 5, elapsedMs: null, loosened: [], turnId: null, checkpoint: null,
  createdAt: new Date(), updatedAt: new Date(),
};

describe("ask snapshot", () => {
  it("restores a slot and its recommendation after refresh", () => {
    const target = { day: 2, slot: "dinner" as const };
    expect(toAsk({ ...row, target, query: { pick: row.id } })).toMatchObject({ target, pickTripPlaceId: row.id });
  });
  it("reads legacy query targets", () => {
    expect(toAsk({ ...row, query: { target: { day: 1, slot: "lunch" } } }).target).toEqual({ day: 1, slot: "lunch" });
  });
  it("drops invalid targets and picks", () => {
    const result = toAsk({ ...row, query: { target: { day: -1, slot: "dinner" }, pick: 42 } });
    expect(result.target).toBeUndefined();
    expect(result.pickTripPlaceId).toBeUndefined();
  });
});
