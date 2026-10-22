import type { Metadata } from "next";
import { Suspense } from "react";

import { TripsBoard } from "@/components/trips/trips-board";
import { TripsDock } from "@/components/trips/trips-dock";
import { TripsHeader } from "@/components/trips/trips-header";
import { TripsSkeleton } from "@/components/trips/trips-skeleton";
import { buildNudges, summaryLine } from "@/components/trips/nudges";
import { requirePageUser } from "@/lib/auth/server";
import { listTrips, todayIso } from "@/lib/trips";

export const metadata: Metadata = { title: "Trips · Tastebrief" };

// A Trips overview: the advisor's trips in four stage columns, and a dock of
// plain nudges computed from the same rows. The New trip panel opens over
// this page from `?new=1` (NewTripLauncher in the app layout).
async function TripsContent() {
  const user = await requirePageUser();
  const grouped = await listTrips(user);
  const today = todayIso();
  return (
    <>
      <TripsHeader userName={user.name} summary={summaryLine(grouped, today)} />
      <TripsBoard initial={grouped} today={today} />
      <TripsDock nudges={buildNudges(grouped, today)} />
    </>
  );
}

export default function TripsPage() {
  return (
    <main className="flex flex-1 flex-col pb-[220px]">
      <Suspense fallback={<TripsSkeleton />}>
        <TripsContent />
      </Suspense>
    </main>
  );
}
