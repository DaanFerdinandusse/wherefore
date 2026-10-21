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
import { clients } from "@/lib/db/schema";
import { searchRows } from "@/lib/search/trgm";
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
