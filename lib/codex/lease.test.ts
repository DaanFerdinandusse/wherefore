import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LEASE_MS, REFRESH_TIMEOUT_MS, refreshUnderLease, type LeaseStore } from "./lease";
import type { RefreshedTokens } from "./refresh";

// The refresh lease with a fake clock. The in-memory store mirrors the SQL
// one in token-store.ts: take is a compare-and-set on (lease free or
// expired), commit and release apply only while the owner matches.

type Row = { token: string; leaseUntil: number | null; owner: string | null };

function memoryStore(row: Row): LeaseStore<Row> & { row: Row } {
  return {
    row,
    async take(owner, leaseMs) {
      const now = Date.now();
      if (row.leaseUntil !== null && row.leaseUntil >= now) return undefined;
      row.leaseUntil = now + leaseMs;
      row.owner = owner;
      return { ...row };
    },
    async commit(owner, tokens) {
      if (row.owner !== owner) return false;
      row.token = tokens.accessToken;
      row.leaseUntil = null;
      row.owner = null;
      return true;
    },
    async release(owner) {
      if (row.owner !== owner) return;
      row.leaseUntil = null;
      row.owner = null;
    },
  };
}

const tokens = (accessToken: string): RefreshedTokens => ({
  accessToken,
  refreshToken: `r-${accessToken}`,
  accountId: "acct",
  expiresAt: new Date(Date.now() + 3_600_000),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("refreshUnderLease", () => {
  it("uses a 60 s lease and a 20 s request deadline", () => {
    expect(LEASE_MS).toBe(60_000);
    expect(REFRESH_TIMEOUT_MS).toBe(20_000);
    expect(REFRESH_TIMEOUT_MS).toBeLessThan(LEASE_MS / 2);
  });

  it("commits the new tokens as the owner and clears the lease", async () => {
    const store = memoryStore({ token: "old", leaseUntil: null, owner: null });
    const result = await refreshUnderLease({
      store,
      owner: "a",
      reuse: () => false,
      refresh: async () => tokens("new"),
    });
    expect(result).toMatchObject({ kind: "refreshed", committed: true });
    expect(store.row).toEqual({ token: "new", leaseUntil: null, owner: null });
  });

  it("a second caller loses while the lease is live, and wins once it expired", async () => {
    const store = memoryStore({ token: "old", leaseUntil: null, owner: null });
    let finish: (t: RefreshedTokens) => void = () => {};
    const first = refreshUnderLease({
      store,
      owner: "a",
      reuse: () => false,
      refresh: () => new Promise<RefreshedTokens>((resolve) => (finish = resolve)),
      timeoutMs: 10 * LEASE_MS,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await refreshUnderLease({ store, owner: "b", reuse: () => false, refresh: async () => tokens("b") })).toEqual({
      kind: "lost",
    });

    // A's request runs past its lease; B takes a fresh lease and rotates.
    await vi.advanceTimersByTimeAsync(LEASE_MS + 1_000);
    const second = await refreshUnderLease({ store, owner: "b", reuse: () => false, refresh: async () => tokens("b") });
    expect(second).toMatchObject({ kind: "refreshed", committed: true });
    expect(store.row.token).toBe("b");

    // A's late commit is keyed by its owner token and matches nothing.
    finish(tokens("a-late"));
    expect(await first).toMatchObject({ kind: "refreshed", committed: false });
    expect(store.row.token).toBe("b");
  });

  it("a late release does not free another owner's lease", async () => {
    const store = memoryStore({ token: "old", leaseUntil: null, owner: null });
    let fail: (e: Error) => void = () => {};
    const first = refreshUnderLease({
      store,
      owner: "a",
      reuse: () => false,
      refresh: () => new Promise<RefreshedTokens>((_, reject) => (fail = reject)),
      timeoutMs: 10 * LEASE_MS,
    });
    await vi.advanceTimersByTimeAsync(LEASE_MS + 1_000);
    let finishB: (t: RefreshedTokens) => void = () => {};
    const second = refreshUnderLease({
      store,
      owner: "b",
      reuse: () => false,
      refresh: () => new Promise<RefreshedTokens>((resolve) => (finishB = resolve)),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.row.owner).toBe("b");

    fail(new Error("upstream 500"));
    await expect(first).rejects.toThrow("upstream 500");
    expect(store.row.owner).toBe("b");

    finishB(tokens("b"));
    await expect(second).resolves.toMatchObject({ committed: true });
  });

  it("aborts the refresh request at the deadline, well before the lease ends, and releases", async () => {
    const store = memoryStore({ token: "old", leaseUntil: null, owner: null });
    let seen: AbortSignal | undefined;
    const attempt = refreshUnderLease({
      store,
      owner: "a",
      reuse: () => false,
      refresh: (_row, signal) =>
        new Promise<RefreshedTokens>((_, reject) => {
          seen = signal;
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    });
    const settled = expect(attempt).rejects.toThrow(/timed out after 20 s/);
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS - 1);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(seen?.aborted).toBe(true);
    expect(store.row).toMatchObject({ leaseUntil: null, owner: null, token: "old" });
  });

  it("reuses a token another caller already rotated, and releases the lease", async () => {
    const store = memoryStore({ token: "fresh", leaseUntil: null, owner: null });
    const refresh = vi.fn(async () => tokens("unneeded"));
    const result = await refreshUnderLease({ store, owner: "a", reuse: (row) => row.token === "fresh", refresh });
    expect(result).toMatchObject({ kind: "reused" });
    expect(refresh).not.toHaveBeenCalled();
    expect(store.row.owner).toBeNull();
  });
});
