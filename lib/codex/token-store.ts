import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { codexCredentials } from "@/lib/db/schema";

import { parseCodexAuthJson, type ImportedCodexAuth } from "./auth-json";
import { decryptToken, encryptToken, parseTokenKey } from "./crypto";
import { refreshUnderLease, REFRESH_TIMEOUT_MS, type LeaseStore } from "./lease";
import { refreshCodexTokens } from "./refresh";

// The app's one ChatGPT subscription credential, in the codex_credentials row
// "default". Replaces itinerary-canvas's auth.json on a volume: on Vercel many
// function instances read the row at once, so the refresh is single-flighted
// through a compare-and-set lease (the HTTP driver has no interactive
// transactions, so no advisory lock).

const ROW_ID = "default";
// Refresh early, never at the last second. Not earlier than this: the same
// refresh token is shared with Daan's local Codex CLI and every refresh rotates
// it, so a needless refresh logs the CLI out.
const REFRESH_WINDOW_MS = 5 * 60_000;
const LOSER_POLL_MS = 500;
// The winner may take up to its refresh deadline; wait a little longer than that.
const LOSER_WAIT_MS = REFRESH_TIMEOUT_MS + 5_000;
// Per-instance cache so a burst of model calls does not read the row each time.
const CACHE_MS = 60_000;

export type CodexCredential = {
  accessToken: string;
  accountId: string;
  expiresAt: Date;
  lastRefresh: Date | null;
};

export class CodexNotConnectedError extends Error {
  constructor() {
    super("The model subscription is not connected. Run npm run codex:import, or set CODEX_AUTH_JSON.");
    this.name = "CodexNotConnectedError";
  }
}

type Row = typeof codexCredentials.$inferSelect;

let cached: { credential: CodexCredential; readAt: number } | undefined;

function key(): Buffer {
  return parseTokenKey(process.env.CODEX_TOKEN_KEY);
}

function toCredential(row: Row): CodexCredential {
  return {
    accessToken: decryptToken(row.accessTokenEnc, key()),
    accountId: row.accountId,
    expiresAt: row.expiresAt,
    lastRefresh: row.lastRefresh,
  };
}

function needsRefresh(expiresAt: Date, now = Date.now()): boolean {
  return expiresAt.getTime() - now < REFRESH_WINDOW_MS;
}

async function readRow(): Promise<Row | undefined> {
  const rows = await db.select().from(codexCredentials).where(eq(codexCredentials.id, ROW_ID)).limit(1);
  return rows[0];
}

/**
 * Writes an imported credential (script or first-boot seed). `onlyIfMissing`
 * is the seed path: the row always wins once it exists, because a token
 * rotated by a later refresh must never be clobbered by a stale seed.
 */
export async function saveCodexCredential(
  auth: ImportedCodexAuth,
  { onlyIfMissing = false }: { onlyIfMissing?: boolean } = {},
): Promise<void> {
  const k = key();
  const values = {
    id: ROW_ID,
    accessTokenEnc: encryptToken(auth.accessToken, k),
    refreshTokenEnc: encryptToken(auth.refreshToken, k),
    accountId: auth.accountId,
    expiresAt: auth.expiresAt,
    lastRefresh: auth.lastRefresh ?? null,
    refreshLeaseUntil: null,
    refreshLeaseOwner: null,
    updatedAt: new Date(),
  };
  const insert = db.insert(codexCredentials).values(values);
  if (onlyIfMissing) await insert.onConflictDoNothing();
  else await insert.onConflictDoUpdate({ target: codexCredentials.id, set: values });
  cached = undefined;
}

async function readOrSeed(): Promise<Row> {
  const row = await readRow();
  if (row) return row;
  const seed = process.env.CODEX_AUTH_JSON;
  if (!seed) throw new CodexNotConnectedError();
  await saveCodexCredential(parseCodexAuthJson(seed), { onlyIfMissing: true });
  const seeded = await readRow();
  if (!seeded) throw new CodexNotConnectedError();
  return seeded;
}

const owned = (owner: string) => and(eq(codexCredentials.id, ROW_ID), eq(codexCredentials.refreshLeaseOwner, owner));

/**
 * The lease in SQL. take is one compare-and-set: exactly one caller across
 * all instances wins while the lease is live; a lease left by a crashed
 * winner expires after LEASE_MS. commit and release only apply while the
 * caller's owner token is still on the row (lease.ts says why).
 */
const leaseStore: LeaseStore<Row> = {
  async take(owner, leaseMs) {
    const rows = await db
      .update(codexCredentials)
      .set({
        refreshLeaseUntil: sql`now() + make_interval(secs => ${leaseMs / 1000})`,
        refreshLeaseOwner: owner,
      })
      .where(
        and(
          eq(codexCredentials.id, ROW_ID),
          or(isNull(codexCredentials.refreshLeaseUntil), lt(codexCredentials.refreshLeaseUntil, sql`now()`)),
        ),
      )
      .returning();
    return rows[0];
  },
  async commit(owner, next, refreshedAt) {
    const k = key();
    const rows = await db
      .update(codexCredentials)
      .set({
        accessTokenEnc: encryptToken(next.accessToken, k),
        refreshTokenEnc: encryptToken(next.refreshToken, k),
        accountId: next.accountId,
        expiresAt: next.expiresAt,
        lastRefresh: refreshedAt,
        refreshLeaseUntil: null,
        refreshLeaseOwner: null,
        updatedAt: refreshedAt,
      })
      .where(owned(owner))
      .returning({ id: codexCredentials.id });
    return rows.length > 0;
  },
  async release(owner) {
    await db
      .update(codexCredentials)
      .set({ refreshLeaseUntil: null, refreshLeaseOwner: null })
      .where(owned(owner));
  },
};

/** Waits for the lease winner to write a new token, then returns it. */
async function waitForWinner(previous: Row): Promise<CodexCredential> {
  const deadline = Date.now() + LOSER_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LOSER_POLL_MS));
    const row = await readRow();
    if (row && row.accessTokenEnc !== previous.accessTokenEnc) return toCredential(row);
    // The winner gave up (lease cleared without a new token): retry the race.
    if (row && row.refreshLeaseUntil === null) return refreshNow(row);
  }
  throw new Error("Timed out waiting for the model subscription token refresh");
}

async function refreshNow(row: Row): Promise<CodexCredential> {
  const result = await refreshUnderLease<Row>({
    store: leaseStore,
    owner: randomUUID(),
    // Someone refreshed between our read and the lease: their token is good.
    reuse: (leased) => leased.accessTokenEnc !== row.accessTokenEnc && !needsRefresh(leased.expiresAt),
    refresh: (leased, signal) => refreshCodexTokens(decryptToken(leased.refreshTokenEnc, key()), { signal }),
  });
  switch (result.kind) {
    case "lost":
      return waitForWinner(row);
    case "reused":
      return toCredential(result.row);
    case "refreshed": {
      if (!result.committed) {
        // The lease expired under us and another caller owns the row now; the
        // rotated tokens are good for this call but must not overwrite theirs.
        console.error("[codex] token refresh finished after the lease expired; not written");
      }
      const { tokens, refreshedAt } = result;
      return { accessToken: tokens.accessToken, accountId: tokens.accountId, expiresAt: tokens.expiresAt, lastRefresh: refreshedAt };
    }
  }
}

/**
 * The credential to call the Codex endpoint with, refreshed when it expires
 * within 5 minutes.
 *
 * `rejectedAccessToken` is the 401 path: the upstream refused that token, so
 * refresh even if the clock says it is fresh, unless another caller already
 * replaced it (then the new one is returned without a second rotation).
 *
 * @throws CodexNotConnectedError when there is no row and no CODEX_AUTH_JSON seed.
 */
export async function getCodexCredential({
  rejectedAccessToken,
}: { rejectedAccessToken?: string } = {}): Promise<CodexCredential> {
  const now = Date.now();
  if (
    !rejectedAccessToken &&
    cached &&
    now - cached.readAt < CACHE_MS &&
    !needsRefresh(cached.credential.expiresAt, now)
  ) {
    return cached.credential;
  }

  const row = await readOrSeed();
  const current = toCredential(row);
  const rejected = rejectedAccessToken !== undefined && rejectedAccessToken === current.accessToken;
  const credential = rejected || needsRefresh(current.expiresAt, now) ? await refreshNow(row) : current;
  cached = { credential, readAt: Date.now() };
  return credential;
}

/** For the health route and a settings row: no secrets, no refresh. */
export async function describeCodexCredential(): Promise<
  { connected: false } | { connected: true; accountId: string; expiresAt: Date; lastRefresh: Date | null }
> {
  const row = await readRow();
  if (!row) return { connected: false };
  return { connected: true, accountId: row.accountId, expiresAt: row.expiresAt, lastRefresh: row.lastRefresh };
}
