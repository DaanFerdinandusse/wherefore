import Link from "next/link";

import type { TripCard } from "@/lib/trips/contracts";
import { DEV_TRIP_PREFIX } from "@/lib/trips/dev";

import { cardDatesLabel } from "./format";

// Development only: trips made by the dev fixtures (chat lab, e2e seed),
// kept off the stage columns and listed here in one small group at the
// bottom of the Trips overview. The page never renders this in production.
export function DevTrips({ trips }: { trips: TripCard[] }) {
  if (trips.length === 0) return null;
  return (
    <section aria-labelledby="dev-trips" className="mx-7 mt-10 flex flex-col gap-2.5 border-t border-rule-strong pt-5">
      <h2 id="dev-trips" className="label-caps text-text-muted">
        Dev
      </h2>
      <ul className="flex flex-wrap gap-2">
        {trips.map((trip) => (
          <li key={trip.id}>
            <Link
              href={`/trips/${trip.id}`}
              className="inline-flex items-center gap-2 rounded-pill border border-dashed border-pill-outline px-3.5 py-1.5 text-ui-sm text-ink hover:border-ink hover:bg-ink/5"
            >
              {trip.title.slice(DEV_TRIP_PREFIX.length)}
              <span className="text-text-muted">{cardDatesLabel(trip)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
