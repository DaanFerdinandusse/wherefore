import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/auth/errors";
import {
  addFavorite,
  createClient,
  getClient,
  getClientProfile,
  listClients,
  removeFavorite,
  reorderFavorites,
  updateClientFields,
} from "@/lib/clients";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { db } from "@/lib/db";
import { clients, trips } from "@/lib/db/schema";
import { searchRows, setWordThreshold, trgmMatch } from "@/lib/search/trgm";
import { createTrip, getTrip } from "@/lib/trips";

const run = testRun();

describe.skipIf(!hasDatabase)("clients", () => {
  afterAll(() => cleanup(run));

  it("creates a client whose search column finds it through a typo", async () => {
    const ana = await createClient(
      { name: "Ana Ruiz", homeCity: "New York", notes: "Natural wine, quiet rooms" },
      run.owner,
    );
    expect(ana.search).toBe("Ana Ruiz New York Natural wine, quiet rooms");

    const listed = await listClients(run.owner, { q: "Anna Ruis" });
    expect(listed.map((c) => c.id)).toContain(ana.id);
    expect(listed[0]?.favoritesCount).toBe(0);

    const rows = await searchRows(clients, run.owner, "Anna Ruis", 5);
    expect(rows[0]?.id).toBe(ana.id);

    // Another advisor's search never sees her.
    expect(await listClients(run.otherOwner, { q: "Ana Ruiz" })).toEqual([]);
    expect(await getClient(ana.id, run.otherOwner)).toBeNull();
  });

  it("renaming a client rewrites its trips' client name and search", async () => {
    const marcus = await createClient({ name: "Marcus Bell", homeCity: "London" }, run.owner);
    const { trip } = await createTrip(run.owner, {
      clientId: marcus.id,
      destination: LISBON,
      datesMode: "unset",
      adults: 1,
      children: 0,
      travelers: [],
    });
    expect(trip.title).toBe("Lisbon for Marcus");

    const renamed = await updateClientFields(marcus.id, { name: "Marcus Bellamy", notes: "Jazz bars" }, run.owner);
    expect(renamed.search).toBe("Marcus Bellamy London Jazz bars");

    const after = await getTrip(trip.id, run.owner);
    expect(after?.clientName).toBe("Marcus Bellamy");
    expect(after?.search).toBe("Lisbon for Marcus Marcus Bellamy Lisbon");

    await expect(updateClientFields(marcus.id, { name: "Hijack" }, run.otherOwner)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("summaries ignore trips outside the caller's scope", async () => {
    const nora = await createClient({ name: "Nora Quist" }, run.owner);
    const { trip: mine } = await createTrip(run.owner, {
      clientId: nora.id,
      destination: LISBON,
      startDate: "2099-03-01",
      endDate: "2099-03-04",
      datesMode: "exact",
      adults: 1,
      children: 0,
      travelers: [],
    });
    // A row another advisor wrote against her client id, past the helpers.
    const otherId = randomUUID();
    await db.insert(trips).values({
      id: otherId,
      ownerId: run.otherOwner,
      clientId: nora.id,
      title: "Not yours",
      destination: LISBON,
      startDate: "2098-01-01",
      endDate: "2098-01-02",
      datesMode: "exact",
      clientName: "Nora Quist",
      updatedAt: new Date("2100-01-01T00:00:00Z"),
    });

    try {
      const [summary] = await listClients(run.owner, { q: "Nora Quist" });
      expect(summary?.nextTrip).toEqual({ id: mine.id, title: mine.title, startDate: "2099-03-01" });
      expect(summary?.lastActivityAt.getTime()).toBeLessThan(new Date("2100-01-01T00:00:00Z").getTime());
    } finally {
      // It points at this owner's client, so it must go before cleanup() deletes clients.
      await db.delete(trips).where(eq(trips.id, otherId));
    }
  });

  it("serves the whole search predicate from the trigram index", async () => {
    // With sequential scans priced out, an unindexable OR branch would still
    // force a scan; every branch here is a gin_trgm_ops operator.
    const [, , plan] = await db.batch([
      setWordThreshold(),
      db.execute(sql`select set_config('enable_seqscan', 'off', true)`),
      db.execute(
        sql`explain select id from clients where ${trgmMatch(clients.search, "Anna Ruis")}`,
      ),
    ]);
    const text = plan.rows.map((row) => String(Object.values(row)[0])).join("\n");
    expect(text).toContain("clients_search_trgm_idx");
  });

  it("keeps favorites in order and scoped to the owner", async () => {
    const client = await createClient({ name: "Lea Park" }, run.owner);
    const a = await addFavorite(client.id, { query: "Via Carota", match: "unmatched", candidates: [] }, run.owner);
    const b = await addFavorite(client.id, { query: "Lilia", match: "unmatched", candidates: [] }, run.owner);
    expect([a.position, b.position]).toEqual([0, 1]);

    await reorderFavorites(client.id, [b.id, a.id], run.owner);
    const profile = await getClientProfile(client.id, run.owner);
    expect(profile?.favorites.map((f) => f.query)).toEqual(["Lilia", "Via Carota"]);

    await expect(removeFavorite(a.id, run.otherOwner)).rejects.toBeInstanceOf(NotFoundError);
    await removeFavorite(a.id, run.owner);
    const summary = (await listClients(run.owner, { q: "Lea Park" }))[0];
    expect(summary?.favoritesCount).toBe(1);
  });
});
