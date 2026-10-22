import type { Metadata } from "next";
import { Suspense } from "react";

import { DevTrips } from "@/components/trips/dev-trips";
import { TripsBoard } from "@/components/trips/trips-board";
import { TripsDock } from "@/components/trips/trips-dock";
import { TripsHeader } from "@/components/trips/trips-header";
import { TripsSkeleton } from "@/components/trips/trips-skeleton";
import { buildNudges, summaryLine } from "@/components/trips/nudges";
import { requirePageUser } from "@/lib/auth/server";
import { listTrips, todayIso } from "@/lib/trips";
import { showDevTrips } from "@/lib/trips/dev";
import { boardState } from "@/components/trips/columns";

export const metadata: Metadata = { title: "Trips · Tastebrief" };

// A Trips overview: the advisor's trips in four stage columns, and a dock of
// plain nudges computed from the same rows. The New trip panel opens over
// this page from `?new=1` (NewTripLauncher in the app layout). Trips made by
// the dev fixtures stay off the columns; in development they are listed in a
// small "Dev" group at the bottom, in production not at all.
async function TripsContent() {
  const user = await requirePageUser();
  const [byStage, devByStage] = await Promise.all([
    listTrips(user),
    showDevTrips() ? listTrips(user, { dev: "only" }) : Promise.resolve(null),
  ]);
  const grouped = boardState(byStage);
  const devTrips = devByStage ? Object.values(devByStage).flatMap((column) => column.trips) : [];
  const today = todayIso();
  return (
    <>
      <TripsHeader userName={user.name} summary={summaryLine(grouped, today)} />
      <TripsBoard initial={grouped} today={today} />
      <DevTrips trips={devTrips} />
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
