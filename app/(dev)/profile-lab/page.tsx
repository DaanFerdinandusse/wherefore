import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { tripPlaces, trips } from "@/lib/db/schema";
import { getTripSnapshot } from "@/lib/trips";
import { loadTripPlaceProfile } from "@/lib/trips/profile-query";

import { ProfileLab, type LabCase } from "./lab";
import { fixtureCases } from "./fixtures";

// Dev page for the place profile sheet: one real trip place from this
// branch's database (the best scored "Your place" on any trip) and two
// fixtures (the Paper design copy, and a place with "Other favorites" and no
// Google listing). Not served in production. Actions only change local state
// here, so the demo data stays as it is.

export const metadata: Metadata = {
  title: "Profile lab · Tastebrief",
  robots: { index: false, follow: false },
};

async function realCase(): Promise<LabCase | null> {
  await connection();
  const [row] = await db
    .select({ tripPlaceId: tripPlaces.id, tripId: trips.id, ownerId: trips.ownerId })
    .from(tripPlaces)
    .innerJoin(trips, eq(trips.id, tripPlaces.tripId))
    .where(and(ne(tripPlaces.status, "removed"), isNotNull(tripPlaces.advisorPlaceId)))
    .orderBy(desc(tripPlaces.bestScore), sql`${tripPlaces.id}`)
    .limit(1);
  if (!row) return null;
  const [snapshot, profile] = await Promise.all([
    getTripSnapshot(row.tripId, row.ownerId),
    loadTripPlaceProfile(row.tripPlaceId, row.ownerId),
  ]);
  if (!snapshot || !profile) return null;
  return {
    id: "real",
    title: `${profile.card.name}, ${snapshot.trip.title} (database)`,
    trip: snapshot.trip,
    clientName: snapshot.trip.clientName,
    slots: snapshot.slots,
    card: profile.card,
    profile,
  };
}

async function LabWithData() {
  const real = await realCase().catch((error: unknown) => {
    console.error("[profile-lab]", error);
    return null;
  });
  return <ProfileLab cases={[...(real ? [real] : []), ...fixtureCases()]} />;
}

export default function ProfileLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={<p className="p-8 text-text-2">Loading the lab</p>}>
      <LabWithData />
    </Suspense>
  );
}
