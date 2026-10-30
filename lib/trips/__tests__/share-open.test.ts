import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addFavorite, createClient } from "@/lib/clients";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { createAsk, createTrip, getTrip, listTrips, recordShareOpen, revokeShare, setShareToken, updateAsk } from "@/lib/trips";

const run = testRun();

describe.skipIf(!hasDatabase)("share opens and board facts", () => {
  let clientId = "";
  let bareClientId = "";

  beforeAll(async () => {
    clientId = (await createClient({ name: "Ana Ruiz" }, run.owner)).id;
    bareClientId = (await createClient({ name: "Jonas Berg" }, run.owner)).id;
    await addFavorite(clientId, { query: "Via Carota", match: "unmatched", candidates: [] }, run.owner);
  });

  afterAll(() => cleanup(run));

  function newTrip(client: string) {
    return createTrip(run.owner, {
      clientId: client,
      destination: LISBON,
      startDate: "2099-05-14",
      endDate: "2099-05-18",
      datesMode: "exact",
      adults: 1,
      children: 0,
      travelers: [],
    });
  }

  it("records the traveler's opens, skips the advisor's own and clears them with the link", async () => {
    const { trip } = await newTrip(clientId);
    const shared = await setShareToken(trip.id, run.owner);
    expect(shared.shareOpensTracked).toBe(true);
    const token = shared.shareToken!;

    await recordShareOpen(token, run.owner);
    expect((await getTrip(trip.id, run.owner))?.shareFirstOpenedAt).toBeNull();

    await recordShareOpen(token, null);
    const first = (await getTrip(trip.id, run.owner))!;
    expect(first.shareFirstOpenedAt).toBeInstanceOf(Date);
    expect(first.updatedAt.getTime()).toBe(shared.updatedAt.getTime());

    await recordShareOpen(token, run.otherOwner);
    const second = (await getTrip(trip.id, run.owner))!;
    expect(second.shareFirstOpenedAt?.getTime()).toBe(first.shareFirstOpenedAt?.getTime());
    expect(second.shareLastOpenedAt!.getTime()).toBeGreaterThanOrEqual(first.shareLastOpenedAt!.getTime());

    const revoked = await revokeShare(trip.id, run.owner);
    expect(revoked).toMatchObject({ shareFirstOpenedAt: null, shareLastOpenedAt: null, shareOpensTracked: false });
  });

  it("lists favorites, the last search and the share facts on the card", async () => {
    const { trip } = await newTrip(clientId);
    const { trip: bare } = await newTrip(bareClientId);
    await setShareToken(trip.id, run.owner);
    const ask = await createAsk(trip.id, { label: "Dinner" }, run.owner);
    await updateAsk(ask.id, { status: "done", resultCount: 12 }, run.owner);

    const board = await listTrips(run.owner);
    const cards = Object.values(board).flatMap((column) => column.trips);
    const card = cards.find((c) => c.id === trip.id)!;
    expect(card).toMatchObject({
      stage: "shared",
      clientFavorites: 1,
      shareOpensTracked: true,
      shareLastOpenedAt: null,
      lastAsk: { status: "done", resultCount: 12 },
      counts: { tonightFilled: 0 },
    });
    expect(card.sharedAt).toBeInstanceOf(Date);
    expect(card.lastAsk?.updatedAt).toBeInstanceOf(Date);
    expect(cards.find((c) => c.id === bare.id)).toMatchObject({ clientFavorites: 0, lastAsk: null });
  });
});
