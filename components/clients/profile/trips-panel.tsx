import Link from "next/link";
import { Plus } from "lucide-react";

import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClientTripCard } from "@/lib/clients/contracts";

import { plural, todayIso } from "../format";
import { TripRowCard, UpcomingTripCard } from "./trip-cards";

// The left column of the profile: the next trip large, further upcoming and
// past trips as rows, or the empty state that leads to the first trip.

const MIN_FAVORITES_FOR_TRIP = 3;

export function TripsPanel({
  clientName,
  trips,
  newTripHref,
  matchedFavorites,
  today,
}: {
  clientName: string;
  trips: { upcoming: ClientTripCard[]; past: ClientTripCard[] };
  /** The profile URL with ?new=1&client=<id> (opens the new trip panel); null until the client exists. */
  newTripHref: string | null;
  matchedFavorites: number;
  today: string | null;
}) {
  const [next, ...laterUpcoming] = trips.upcoming;
  // Only a client with trips needs today; the server passes it then.
  const day = today ?? (trips.upcoming.length + trips.past.length > 0 ? todayIso() : "");
  const total = trips.upcoming.length + trips.past.length;
  const summary =
    total === 0
      ? "No trips yet"
      : [trips.upcoming.length ? `${trips.upcoming.length} upcoming` : null, trips.past.length ? `${trips.past.length} past` : null]
          .filter(Boolean)
          .join(" · ");

  return (
    <section aria-labelledby="trips-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 id="trips-title" className="font-display text-[28px] leading-[34px] text-ink">
          Trips
        </h2>
        <p className="text-ui text-text-muted">{summary}</p>
      </div>

      {next ? (
        <UpcomingTripCard trip={next} clientName={clientName} today={day} />
      ) : (
        <EmptyState
          title="Their trips will show up here"
          body={
            matchedFavorites >= MIN_FAVORITES_FOR_TRIP
              ? "Their places are in. Plan their first trip from them."
              : "Add at least three places they love, then plan their first trip."
          }
          className="h-[300px] rounded-3xl! py-0!"
          action={
            newTripHref ? (
              <Link href={newTripHref} className={buttonClasses({ className: "h-11! text-action!" })}>
                <Plus size={14} strokeWidth={2.2} aria-hidden />
                Plan their first trip
              </Link>
            ) : (
              <Button disabled className="h-11! text-action!" icon={<Plus size={14} strokeWidth={2.2} aria-hidden />}>
                Plan their first trip
              </Button>
            )
          }
        />
      )}

      {laterUpcoming.length > 0 ? <TripRows label="Also coming up" trips={laterUpcoming} today={day} /> : null}
      {trips.past.length > 0 ? <TripRows label="Past trips" trips={trips.past} today={day} /> : null}
    </section>
  );
}

function TripRows({ label, trips, today }: { label: string; trips: ClientTripCard[]; today: string }) {
  return (
    <>
      <h3 className="label-caps pt-2 leading-4 text-text-muted">{label}</h3>
      <ul aria-label={`${label}, ${plural(trips.length, "trip")}`} className="grid grid-cols-2 gap-4">
        {trips.map((trip) => (
          <li key={trip.id} className="flex">
            <TripRowCard trip={trip} today={today} />
          </li>
        ))}
      </ul>
    </>
  );
}
