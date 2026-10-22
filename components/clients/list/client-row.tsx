import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { FilmImage } from "@/components/ui/film-image";
import type { ClientSummary, ClientTripCard } from "@/lib/clients/contracts";
import { computeStage } from "@/lib/trips/stage";
import { cn } from "@/lib/ui/cn";

import { activityLabel, STAGE_LABEL, tripDatesLabel } from "../format";
import { COLUMNS } from "./columns";

// One client on the Clients page: who, the places they love, the next trip
// and its stage, the number of trips, the last activity. The whole row opens
// the profile (a stretched link over every cell, so a click anywhere and
// Enter on the focused row open it); "Start a trip" sits above it.

const THUMBS = 4;
const MIN_FAVORITES_FOR_TRIP = 3;

export function ClientRow({
  client,
  nextTrip,
  tripCount,
  startTripHref,
  today,
  now,
}: {
  client: ClientSummary;
  nextTrip: ClientTripCard | null;
  tripCount: number;
  /** The current URL with ?new=1&client=<id>, which opens the new trip panel. */
  startTripHref: string;
  today: string;
  now: Date;
}) {
  const extra = Math.max(0, client.favoritesCount - client.favoriteImages.length);
  const placeholders = Math.max(0, THUMBS - client.favoriteImages.length);

  return (
    <li className="relative flex items-center gap-6 rounded-[22px] bg-surface px-5 py-3.5 transition-colors hover:bg-surface-hover">
      <Link
        href={`/clients/${client.id}`}
        aria-label={`Open ${client.name}`}
        className="absolute inset-0 z-[1] rounded-[22px] focus-visible:outline-offset-0"
      />

      <div className={cn("flex shrink-0 items-center gap-3.5", COLUMNS.client)}>
        <Avatar
          name={client.name}
          src={client.avatarUrl ?? undefined}
          size={48}
          className="font-display! text-[22px]! leading-6! font-normal!"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-body-lg leading-[21px] font-semibold text-ink">{client.name}</span>
          <span className="truncate text-ui-sm leading-[18px] text-text-muted">
            {client.status === "guest" ? "Guest" : (client.homeCity ?? "Home city not set")}
          </span>
        </div>
      </div>

      <div className={cn("flex shrink-0 items-center gap-1.5", COLUMNS.loves)} aria-label={`${client.favoritesCount} favorite places`}>
        {client.favoriteImages.slice(0, THUMBS).map((url, i) => (
          <span key={`${i}-${url}`} className="relative size-10 shrink-0 overflow-hidden rounded-xl bg-avatar">
            <FilmImage src={url} alt="" sizes="40px" />
          </span>
        ))}
        {Array.from({ length: placeholders }, (_, i) => (
          <span key={i} aria-hidden className="size-10 shrink-0 rounded-xl border-[1.5px] border-dashed border-rule-strong bg-avatar" />
        ))}
        {extra > 0 ? <span className="pl-1 text-ui-sm font-semibold text-text-muted">+{extra}</span> : null}
      </div>

      <div className={cn("flex shrink-0 items-center gap-3", COLUMNS.nextTrip)}>
        {nextTrip ? (
          <>
            <span className="relative h-11 w-16 shrink-0 overflow-hidden rounded-xl bg-avatar">
              {nextTrip.imageUrl ? <FilmImage src={nextTrip.imageUrl} alt="" sizes="64px" /> : null}
            </span>
            <span className="flex min-w-0 grow flex-col">
              <span className="truncate text-body leading-5 font-semibold text-ink">{nextTrip.destinationName || nextTrip.title}</span>
              <span className="truncate text-ui-sm leading-[18px] text-text-muted">
                {tripDatesLabel(nextTrip.startDate, nextTrip.endDate, today) ?? "Dates not set"}
              </span>
            </span>
            <span className="shrink-0 rounded-pill border border-pill-outline px-2.5 py-1 text-meta font-semibold text-ink">
              {STAGE_LABEL[computeStage(nextTrip, today)]}
            </span>
          </>
        ) : (
          <>
            <span aria-hidden className="h-11 w-16 shrink-0 rounded-xl border-[1.5px] border-dashed border-rule-strong" />
            <span className="flex min-w-0 grow flex-col">
              <span className="text-body leading-5 font-semibold text-ink">No trip yet</span>
              <span className="truncate text-ui-sm leading-[18px] text-text-muted">
                {client.favoritesCount >= MIN_FAVORITES_FOR_TRIP ? "Ready for a first trip" : "Add their favorites first"}
              </span>
            </span>
            <Link
              href={startTripHref}
              className="relative z-10 shrink-0 rounded-pill bg-ink px-2.5 py-1 text-meta font-semibold text-surface transition-colors hover:bg-text-4"
            >
              Start a trip
            </Link>
          </>
        )}
      </div>

      <span className={cn("shrink-0 text-body leading-5 font-medium text-ink", COLUMNS.trips)}>{tripCount}</span>
      <span className={cn("shrink-0 text-ui leading-[19px] text-text-3", COLUMNS.activity)}>
        {activityLabel(new Date(client.lastActivityAt), now)}
      </span>
      <ChevronRight size={18} strokeWidth={2} aria-hidden className="shrink-0 text-text-muted" />
    </li>
  );
}
