"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { FilmImage } from "@/components/ui/film-image";
import { Popover } from "@/components/ui/popover";
import type { ClientTripCard } from "@/lib/clients/contracts";
import { computeStage } from "@/lib/trips/stage";

import { plural, STAGE_LABEL, tripDatesLabel } from "../format";

// C2 footer: the next trip (photo, place, dates, stage), "All 3 trips" with
// every trip in a list above it, and "+ New trip for Ana". Without a trip
// ahead the last one shows; without any, a line that leads to the first.

function TripLine({ trip, label, today }: { trip: ClientTripCard; label: string; today: string }) {
  return (
    <Link href={`/trips/${trip.id}`} className="group flex min-w-0 items-center gap-3.5 rounded-row">
      <span className="relative h-11 w-16 shrink-0 overflow-hidden rounded-xl bg-avatar">
        {trip.imageUrl ? <FilmImage src={trip.imageUrl} alt="" sizes="64px" /> : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-ui-sm text-text-muted">{label}</span>
        <span className="truncate text-body leading-5 font-semibold text-ink group-hover:underline">
          {trip.destinationName || trip.title}
          <span className="font-normal text-text-2"> · {tripDatesLabel(trip.startDate, trip.endDate, today) ?? "Dates not set"}</span>
        </span>
      </span>
    </Link>
  );
}

function StagePill({ trip, today }: { trip: ClientTripCard; today: string }) {
  return (
    <span className="shrink-0 rounded-pill border border-pill-outline px-2.5 py-1 text-meta font-semibold text-ink">
      {STAGE_LABEL[computeStage(trip, today)]}
    </span>
  );
}

function AllTrips({ trips, today }: { trips: ClientTripCard[]; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="All trips"
      panelClassName="top-auto! bottom-full! mt-0! mb-3 w-[380px] p-2!"
      trigger={(props) => (
        <button type="button" {...props} className="pl-2.5 text-ui font-semibold text-ink underline underline-offset-2 hover:text-text-3">
          All {plural(trips.length, "trip")}
        </button>
      )}
    >
      <ul className="flex max-h-[360px] flex-col overflow-auto">
        {trips.map((trip) => (
          <li key={trip.id}>
            <Link
              href={`/trips/${trip.id}`}
              className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-hover"
            >
              <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-[10px] bg-avatar">
                {trip.imageUrl ? <FilmImage src={trip.imageUrl} alt="" sizes="56px" /> : null}
              </span>
              <span className="flex min-w-0 grow flex-col">
                <span className="truncate text-ui font-semibold text-ink">{trip.destinationName || trip.title}</span>
                <span className="truncate text-ui-sm text-text-2">
                  {tripDatesLabel(trip.startDate, trip.endDate, today) ?? "Dates not set"} · {STAGE_LABEL[computeStage(trip, today)]}
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={2} aria-hidden className="shrink-0 text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

export function ProfileFooter({
  first,
  trips,
  today,
  newTripHref,
}: {
  first: string;
  trips: { upcoming: ClientTripCard[]; past: ClientTripCard[] };
  today: string;
  newTripHref: string;
}) {
  const next = trips.upcoming[0];
  const last = trips.past[0];
  const shown = next ?? last;
  const all = [...trips.upcoming, ...trips.past];

  return (
    <footer className="flex shrink-0 items-center justify-between gap-6 border-t border-ink/8 px-10 py-[18px] max-lg:px-7">
      <div className="flex min-w-0 items-center gap-3.5">
        {shown ? (
          <>
            <TripLine trip={shown} label={next ? "Next trip" : "Last trip"} today={today} />
            <StagePill trip={shown} today={today} />
          </>
        ) : (
          <p className="text-body text-text-2">No trips yet. Plan the first one from the places {first} loves.</p>
        )}
        {all.length > 1 ? <AllTrips trips={all} today={today} /> : null}
      </div>
      <Link href={newTripHref} className={buttonClasses({ size: "lg", className: "h-11! px-[22px]!" })}>
        <Plus size={16} strokeWidth={2.4} aria-hidden />
        New trip for {first}
      </Link>
    </footer>
  );
}
