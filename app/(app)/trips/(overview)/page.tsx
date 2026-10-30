import type { Metadata } from "next";
import { Suspense } from "react";

import { DevTrips } from "@/components/trips/dev-trips";
import { TripsBoard } from "@/components/trips/trips-board";
import { TripsDock } from "@/components/trips/trips-dock";
import { TripsHeader } from "@/components/trips/trips-header";
import { TripsSkeleton } from "@/components/trips/trips-skeleton";
import { buildNudges, summaryLine } from "@/components/trips/nudges";
import { NewTripLink } from "@/components/shell/new-trip-link";
import { AppPage } from "@/components/shell/app-page";
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
  const inProgress = byStage.planning.total + byStage.shared.total + byStage.traveling.total;
  return (
    <AppPage section="trips" detail={`${inProgress} in progress`} actions={<NewTripLink />} bodyClassName="pb-[220px]">
      <TripsHeader userName={user.name} summary={summaryLine(grouped, today)} />
      <TripsBoard initial={grouped} today={today} />
      <DevTrips trips={devTrips} />
      <TripsDock nudges={buildNudges(grouped, today)} />
    </AppPage>
  );
}

export default function TripsPage() {
  return (
    <Suspense
      fallback={
        <AppPage section="trips" actions={<NewTripLink />}>
          <TripsSkeleton />
        </AppPage>
      }
    >
      <TripsContent />
    </Suspense>
  );
}
