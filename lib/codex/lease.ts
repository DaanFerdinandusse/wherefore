import type { RefreshedTokens } from "./refresh";

// The single-flight token refresh, without the database: take the lease as
// an owner, refresh under a deadline well inside the lease, and commit or
// release only while the lease is still ours. token-store.ts supplies the
// SQL store; lease.test.ts drives it with a fake clock.
//
// Why an owner token: a lease is a time window. If the refresh request ran
// past it, another instance could take a fresh lease and rotate the refresh
// token; a commit keyed by row id alone would then overwrite the newer
// tokens with older ones. Keyed by owner, a late commit matches nothing.

/** How long a lease holds the refresh to one caller. */
export const LEASE_MS = 60_000;
/** The refresh request's deadline: well under the lease, so the commit lands while the lease is ours. */
export const REFRESH_TIMEOUT_MS = 20_000;

export type LeaseStore<Row> = {
  /** Compare-and-set: takes the lease for `owner` until now + `leaseMs` when free or expired. */
  take(owner: string, leaseMs: number): Promise<Row | undefined>;
  /** Writes the new tokens and clears the lease, only while `owner` holds it. */
  commit(owner: string, tokens: RefreshedTokens, refreshedAt: Date): Promise<boolean>;
  /** Clears the lease, only while `owner` holds it. */
  release(owner: string): Promise<void>;
};

export type LeasedRefresh<Row> =
  | { kind: "lost" }
  | { kind: "reused"; row: Row }
  | { kind: "refreshed"; tokens: RefreshedTokens; refreshedAt: Date; committed: boolean };

/**
 * One attempt at the refresh as a lease owner.
 *
 * - lost: another caller holds the lease (wait for its result instead).
 * - reused: the leased row already carries a usable token (someone refreshed
 *   between our read and the lease); the lease is released.
 * - refreshed: we rotated the tokens. `committed` is false when the lease
 *   was no longer ours at commit time; the tokens are valid for this call
 *   but were not written, so a newer write is never clobbered.
 *
 * The refresh gets an AbortSignal that fires at REFRESH_TIMEOUT_MS. On any
 * refresh error the lease is released (by owner) and the error rethrown.
 */
export async function refreshUnderLease<Row>({
  store,
  owner,
  reuse,
  refresh,
  now = () => new Date(),
  leaseMs = LEASE_MS,
  timeoutMs = REFRESH_TIMEOUT_MS,
}: {
  store: LeaseStore<Row>;
  owner: string;
  /** True when the leased row's token is already good: skip the rotation. */
  reuse: (row: Row) => boolean;
  refresh: (row: Row, signal: AbortSignal) => Promise<RefreshedTokens>;
  now?: () => Date;
  leaseMs?: number;
  timeoutMs?: number;
}): Promise<LeasedRefresh<Row>> {
  const row = await store.take(owner, leaseMs);
  if (!row) return { kind: "lost" };
  if (reuse(row)) {
    await store.release(owner);
    return { kind: "reused", row };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`Token refresh timed out after ${Math.round(timeoutMs / 1000)} s`)),
    timeoutMs,
  );
  let tokens: RefreshedTokens;
  try {
    tokens = await refresh(row, controller.signal);
  } catch (error) {
    await store.release(owner).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const refreshedAt = now();
  const committed = await store.commit(owner, tokens, refreshedAt);
  return { kind: "refreshed", tokens, refreshedAt, committed };
}
