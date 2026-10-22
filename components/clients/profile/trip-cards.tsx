import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { FilmImage } from "@/components/ui/film-image";
import type { ClientTripCard } from "@/lib/clients/contracts";
import { computeStage, tripDayCount } from "@/lib/trips/stage";

import { daysUntil, firstName, inDaysLabel, plural, tripDatesLabel } from "../format";

// The Trips panel's cards: the large upcoming trip on its photo, and the
// compact rows for past (or further upcoming) trips.

function upcomingBadge(trip: ClientTripCard, clientName: string, today: string): string {
  const stage = computeStage(trip, today);
  if (stage === "traveling") return "Traveling now";
  const when = trip.startDate ? inDaysLabel(daysUntil(trip.startDate, today)) : "dates not set";
  const who = firstName(clientName);
  return stage === "shared" ? `Shared with ${who} · ${when}` : `Planning · ${when}`;
}

function upcomingLine(trip: ClientTripCard, today: string): string {
  const dates = tripDatesLabel(trip.startDate, trip.endDate, today) ?? "Dates not set yet";
  const days = tripDayCount(trip);
  const places =
    trip.placeCount > 0 ? `${plural(trip.placeCount, "place")} in ${plural(days, "day")}` : "No places added yet";
  return `${dates} · ${places}`;
}

export function UpcomingTripCard({ trip, clientName, today }: { trip: ClientTripCard; clientName: string; today: string }) {
  return (
    <article className="relative h-[300px] shrink-0 overflow-hidden rounded-sheet bg-avatar shadow-card">
      {trip.imageUrl ? <FilmImage src={trip.imageUrl} alt="" sizes="880px" /> : null}
      <div aria-hidden className="photo-shade absolute inset-0" />
      <span className="absolute top-5 left-5 rounded-pill bg-ink px-3 py-1.5 text-ui-sm font-semibold text-surface">
        {upcomingBadge(trip, clientName, today)}
      </span>
      <div className="absolute bottom-[26px] left-7 flex flex-col gap-1.5">
        <h3 className="text-card-lg font-light tracking-[-0.02em] text-surface">{trip.destinationName || trip.title}</h3>
        <p className="text-body leading-[21px] text-surface/90">{upcomingLine(trip, today)}</p>
      </div>
      <div className="absolute right-6 bottom-[26px] flex gap-2">
        <Link
          href={`/trips/${trip.id}?view=traveler`}
          className="glass-control inline-flex h-[42px] items-center rounded-pill border border-surface/40 bg-surface/20! px-[18px] text-ui font-semibold text-surface transition-colors hover:bg-surface/30!"
        >
          Traveler view
        </Link>
        <Link href={`/trips/${trip.id}?view=itinerary`} className={buttonClasses({ variant: "light", className: "h-[42px]! px-[18px]!" })}>
          Open itinerary
        </Link>
      </div>
    </article>
  );
}

export function TripRowCard({ trip, today }: { trip: ClientTripCard; today: string }) {
  const dates = tripDatesLabel(trip.startDate, trip.endDate, today) ?? "Dates not set";
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="flex w-full min-w-0 items-center gap-3.5 rounded-[22px] bg-surface p-2.5 transition-colors hover:bg-surface-hover"
    >
      <span className="relative h-[84px] w-[120px] shrink-0 overflow-hidden rounded-2xl bg-avatar">
        {trip.imageUrl ? <FilmImage src={trip.imageUrl} alt="" sizes="120px" /> : null}
      </span>
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate text-card-sm leading-[30px] font-light tracking-[-0.02em] text-ink">
          {trip.destinationName || trip.title}
        </span>
        <span className="truncate text-ui-sm leading-[18px] text-text-muted">
          {dates}
          {trip.placeCount > 0 ? ` · ${plural(trip.placeCount, "place")}` : ""}
        </span>
      </span>
      <ChevronRight size={18} strokeWidth={2} aria-hidden className="mr-2 shrink-0 text-text-muted" />
    </Link>
  );
}
