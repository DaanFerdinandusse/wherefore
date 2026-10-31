import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient } from "@/lib/clients";
import { db } from "@/lib/db";
import { cleanup, hasDatabase, LISBON, testRun } from "@/lib/db/__tests__/fixtures";
import { tripTravelers } from "@/lib/db/schema";
import { createTrip, getTrip } from "@/lib/trips";

import { EXAMPLE_TRIP_TITLE, startExampleTrip } from "../example-trip";

const run = testRun();

function travelersOf(tripId: string) {
  return db
    .select({ name: tripTravelers.name, role: tripTravelers.role, drivesSearch: tripTravelers.drivesSearch })
    .from(tripTravelers)
    .where(eq(tripTravelers.tripId, tripId))
    .orderBy(asc(tripTravelers.position));
}

describe.skipIf(!hasDatabase)("startExampleTrip", () => {
  let seededTripId: string;

  beforeAll(async () => {
    const ana = await createClient({ name: "Ana Ruiz" }, run.owner);
    const { trip } = await createTrip(run.owner, {
      clientId: ana.id,
      destination: LISBON,
      startDate: "2027-05-14",
      endDate: "2027-05-18",
      datesMode: "exact",
      adults: 2,
      children: 0,
      travelers: [{ clientId: null, name: "Clara", role: "guest", drivesSearch: false }],
      title: EXAMPLE_TRIP_TITLE,
    });
    seededTripId = trip.id;
  });

  afterAll(() => cleanup(run));

  it("returns null without the seeded trip", async () => {
    expect(await startExampleTrip(run.otherOwner, run.otherOwner)).toBeNull();
  });

  it("copies the seeded trip when the workspace has no Daan", async () => {
    const id = await startExampleTrip(run.owner, run.owner);
    expect(id).not.toBe(seededTripId);
    const trip = await getTrip(id as string, run.owner);
    expect(trip).toMatchObject({ title: EXAMPLE_TRIP_TITLE, clientName: "Ana Ruiz", adults: 2 });
    expect((await travelersOf(id as string)).map((t) => t.name)).toEqual(["Ana Ruiz", "Clara"]);
  });

  it("sends Daan alone to the seeded destination and dates", async () => {
    await createClient({ name: "Daan" }, run.owner);
    const id = await startExampleTrip(run.owner, run.owner);
    const trip = await getTrip(id as string, run.owner);
    expect(trip).toMatchObject({
      title: "Lisbon for Daan",
      clientName: "Daan",
      adults: 1,
      children: 0,
      startDate: "2027-05-14",
      endDate: "2027-05-18",
      datesMode: "exact",
    });
    expect(trip?.destination).toMatchObject({ name: "Lisbon" });
    expect(await travelersOf(id as string)).toEqual([{ name: "Daan", role: "client", drivesSearch: true }]);
  });
});
