import { describe, expect, it } from "vitest";
import { RunExpiredError, WorkflowRunNotFoundError } from "workflow/errors";

import { readRunState, resolveDuplicateTurn, resolveStreamBinding } from "./turn-state";

describe("readRunState", () => {
  it("reads terminal and live statuses", async () => {
    expect(await readRunState(async () => "completed")).toEqual({ kind: "terminal", status: "completed" });
    expect(await readRunState(async () => "cancelled")).toEqual({ kind: "terminal", status: "cancelled" });
    expect(await readRunState(async () => "running")).toEqual({ kind: "live", status: "running" });
    expect(await readRunState(async () => "pending")).toEqual({ kind: "live", status: "pending" });
  });

  it("a missing run is missing, an expired run keeps its terminal status", async () => {
    expect(await readRunState(() => Promise.reject(new WorkflowRunNotFoundError("r1")))).toEqual({ kind: "missing" });
    expect(await readRunState(() => Promise.reject(new RunExpiredError("gone", "r1", "failed")))).toEqual({
      kind: "terminal",
      status: "failed",
    });
    expect(await readRunState(() => Promise.reject(new RunExpiredError("gone", "r1")))).toEqual({ kind: "missing" });
  });

  it("any other error is unknown, never failed", async () => {
    const state = await readRunState(() => Promise.reject(new Error("fetch failed")));
    expect(state.kind).toBe("unknown");
  });
});

describe("resolveStreamBinding", () => {
  const active = { activeRunId: "run-b", activeTurnId: "turn-b", startIndex: 12 };

  it("is idle without an active run", () => {
    expect(resolveStreamBinding({ activeRunId: null, activeTurnId: "t", startIndex: 3 })).toEqual({ kind: "idle" });
  });

  it("streams the active run at the cursor when the client names it, or names nothing", () => {
    expect(resolveStreamBinding({ ...active, requestedRunId: "run-b" })).toEqual({
      kind: "stream",
      runId: "run-b",
      turnId: "turn-b",
      uiStartIndex: 12,
    });
    expect(resolveStreamBinding({ ...active, requestedTurnId: "turn-b" })).toMatchObject({ kind: "stream", uiStartIndex: 12 });
    expect(resolveStreamBinding(active)).toMatchObject({ kind: "stream", uiStartIndex: 12 });
  });

  it("never applies one run's cursor to another run: reset", () => {
    expect(resolveStreamBinding({ ...active, requestedRunId: "run-a" })).toEqual({ kind: "reset", activeRunId: "run-b" });
    expect(resolveStreamBinding({ ...active, requestedTurnId: "turn-a" })).toEqual({ kind: "reset", activeRunId: "run-b" });
    expect(resolveStreamBinding({ ...active, requestedRunId: "run-b", requestedTurnId: "turn-a" })).toMatchObject({
      kind: "reset",
    });
  });
});

describe("resolveDuplicateTurn", () => {
  const turn = { chatId: "c1", runId: "run-1" };

  it("streams the run while the turn holds the lock", () => {
    expect(
      resolveDuplicateTurn({ chatId: "c1", turnId: "t1", turn, chat: { activeTurnId: "t1", activeRunId: "run-1" } }),
    ).toEqual({ kind: "stream", runId: "run-1" });
  });

  it("waits for the run id when start() has not stored it yet", () => {
    expect(
      resolveDuplicateTurn({
        chatId: "c1",
        turnId: "t1",
        turn: { chatId: "c1", runId: null },
        chat: { activeTurnId: "t1", activeRunId: null },
      }),
    ).toEqual({ kind: "wait" });
  });

  it("returns the recorded outcome once the turn is over, even while another turn runs", () => {
    expect(
      resolveDuplicateTurn({ chatId: "c1", turnId: "t1", turn, chat: { activeTurnId: null, activeRunId: null } }),
    ).toEqual({ kind: "outcome" });
    expect(
      resolveDuplicateTurn({ chatId: "c1", turnId: "t1", turn, chat: { activeTurnId: "t2", activeRunId: "run-2" } }),
    ).toEqual({ kind: "outcome" });
  });

  it("refuses a turnId from another chat", () => {
    expect(
      resolveDuplicateTurn({ chatId: "c2", turnId: "t1", turn, chat: { activeTurnId: null, activeRunId: null } }),
    ).toEqual({ kind: "foreign" });
  });
});
