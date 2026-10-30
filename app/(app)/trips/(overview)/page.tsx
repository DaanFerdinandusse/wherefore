import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";

import { AppPage } from "@/components/shell/app-page";
import { NewTripLink } from "@/components/shell/new-trip-link";
import { PageHeader } from "@/components/shell/page-header";
import { boardState } from "@/components/trips/columns";
import { DevTrips } from "@/components/trips/dev-trips";
import { NeedsYou } from "@/components/trips/needs-you";
import { buildNudges, summaryLine, type StageTotals } from "@/components/trips/nudges";
import { TripsBoard } from "@/components/trips/trips-board";
import { TripsList } from "@/components/trips/trips-list";
import { TripsSkeleton } from "@/components/trips/trips-skeleton";
import { TripsViewToggle } from "@/components/trips/trips-view-toggle";
import { parseTripsView } from "@/components/trips/view";
import { requirePageUser } from "@/lib/auth/server";
import { listTrips, todayIso } from "@/lib/trips";
import { showDevTrips } from "@/lib/trips/dev";
import { shareUrl } from "@/lib/trips/share-actions";

export const metadata: Metadata = { title: "Trips · Tastebrief" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Trips per stage the List view loads: every trip of a normal practice. */
const LIST_PER_STAGE = 100;

/** The request's own origin, for share links when APP_URL is not set. */
async function requestOrigin(): Promise<string | undefined> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return undefined;
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

// The Trips overview: "Needs you" (plain nudges computed from the rows), then
// the trips as four stage columns (Board) or one sortable table (List, from
// ?view=list). The New trip panel opens over this page from `?new=1`
// (NewTripLauncher in the app layout). Trips made by the dev fixtures stay
// off the columns; in development they are listed in a small "Dev" group at
// the bottom, in production not at all.
async function TripsContent({ searchParams }: Props) {
  const [user, params] = await Promise.all([requirePageUser(), searchParams]);
  const view = parseTripsView(params.view);
  const [byStage, devByStage, origin] = await Promise.all([
    listTrips(user, view === "list" ? { perStage: LIST_PER_STAGE } : {}),
    showDevTrips() ? listTrips(user, { dev: "only" }) : Promise.resolve(null),
    requestOrigin(),
  ]);
  const grouped = boardState(byStage);
  const devTrips = devByStage ? Object.values(devByStage).flatMap((column) => column.trips) : [];
  const now = new Date();
  const today = todayIso(now);
  const totals: StageTotals = {
    planning: byStage.planning.total,
    shared: byStage.shared.total,
    traveling: byStage.traveling.total,
    done: byStage.done.total,
  };
  const inProgress = totals.planning + totals.shared + totals.traveling;
  const nudges = buildNudges(grouped, today, now, (token) => shareUrl(token, origin));

  return (
    <AppPage
      section="trips"
      detail={`${inProgress} in progress`}
      toolbar={<TripsViewToggle view={view} />}
      actions={<NewTripLink />}
    >
      <PageHeader title="Trips" subtitle={summaryLine(totals, view)} />
      <NeedsYou nudges={nudges} />
      {view === "list" ? (
        <TripsList initial={grouped} today={today} now={now.toISOString()} />
      ) : (
        <TripsBoard initial={grouped} totals={totals} today={today} now={now.toISOString()} />
      )}
      <DevTrips trips={devTrips} />
    </AppPage>
  );
}

export default function TripsPage(props: Props) {
  return (
    <Suspense
      fallback={
        <AppPage section="trips" actions={<NewTripLink />}>
          <TripsSkeleton />
        </AppPage>
      }
    >
      <TripsContent {...props} />
    </Suspense>
  );
}
