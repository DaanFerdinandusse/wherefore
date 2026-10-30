import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { FilmImage } from "@/components/ui/film-image";
import { Pill } from "@/components/ui/pill";
import type { ClientSummary, ClientTripCard } from "@/lib/clients/contracts";
import { computeStage } from "@/lib/trips/stage";
import { cn } from "@/lib/ui/cn";

import { activityLabel, namesLine, plural, STAGE_LABEL, tripDatesLabel } from "../format";

// One client on the Clients page, as a profile: a collage of the places they
// love, who they are, what they love by name, their taste tags, what else
// they are into, the start of your notes, and the next trip. The whole card
// opens the profile (a stretched link, so a click anywhere and Enter on the
// focused card open it); "Start a trip" sits above it.

const TAGS = 3;
const MEDIA = 2;
const MIN_FAVORITES_FOR_TRIP = 3;

export function ClientCard({
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
  const where = client.status === "guest" ? "Guest" : (client.homeCity ?? "Home city not set");
  const extraTags = Math.max(0, client.tasteTags.length - TAGS);
  const media = client.mediaFavorites.map((item) => item.name ?? item.query).filter(Boolean);
  const notes = client.notesExcerpt.trim();

  return (
    <li className="group relative flex flex-col rounded-card bg-surface transition-colors hover:bg-surface-hover">
      <Link
        href={`/clients/${client.id}`}
        aria-label={`Open ${client.name}`}
        className="absolute inset-0 z-[1] rounded-card focus-visible:outline-offset-0"
      />

      <Collage images={client.favoriteImages} />

      <div className="flex items-end justify-between gap-3 px-5">
        <Avatar
          name={client.name}
          src={client.avatarUrl ?? undefined}
          size={48}
          className="-mt-6 font-display! text-[22px]! leading-6! font-normal! ring-4 ring-surface transition-[box-shadow] group-hover:ring-surface-hover"
        />
        <span className="pb-0.5 text-meta text-text-muted">{activityLabel(new Date(client.lastActivityAt), now)}</span>
      </div>

      <div className="flex grow flex-col gap-4 px-5 pt-3 pb-5">
        <header className="flex flex-col gap-1">
          <h2 className="truncate font-display text-card-sm text-ink">{client.name}</h2>
          <p className="truncate text-ui-sm text-text-muted">
            {where} · {plural(tripCount, "trip")}
          </p>
        </header>

        <Detail label="Loves">
          {client.favoriteNames.length > 0 ? (
            <p className="line-clamp-2 text-ui text-ink">{namesLine(client.favoriteNames, client.favoritesCount)}</p>
          ) : (
            <p className="text-ui text-text-muted">No favorite places yet</p>
          )}
        </Detail>

        <Detail label="Taste">
          {client.tasteTags.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-1.5">
              {client.tasteTags.slice(0, TAGS).map((tag) => (
                <li key={tag.tagId}>
                  <Pill className="h-[26px]! px-2.5!">{tag.name}</Pill>
                </li>
              ))}
              {extraTags > 0 ? <li className="pl-1 text-ui-sm font-semibold text-text-muted">+{extraTags}</li> : null}
            </ul>
          ) : (
            <p className="text-ui text-text-muted">Tags appear once a place they love is matched</p>
          )}
        </Detail>

        {media.length > 0 ? (
          <Detail label="Also into">
            <p className="truncate text-ui text-ink">{namesLine(media.slice(0, MEDIA), media.length)}</p>
          </Detail>
        ) : null}

        {notes ? <p className="line-clamp-2 text-ui-sm text-text-2">{notes}</p> : null}
      </div>

      <NextTrip
        client={client}
        nextTrip={nextTrip}
        startTripHref={startTripHref}
        today={today}
      />
    </li>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps text-text-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * Up to three photos of the places they love: one large on the left, two
 * stacked on the right. Fewer photos fill the frame; none leaves a dashed frame.
 */
function Collage({ images }: { images: string[] }) {
  const shown = images.slice(0, 3);
  if (shown.length === 0) {
    return (
      <div className="p-2 pb-0">
        <div aria-hidden className="h-40 rounded-row border-[1.5px] border-dashed border-rule-strong bg-avatar/50" />
      </div>
    );
  }
  return (
    <div className="p-2 pb-0">
      <div
        aria-hidden
        className={cn(
          "grid h-40 gap-1 overflow-hidden rounded-row",
          shown.length === 1 && "grid-cols-1",
          shown.length === 2 && "grid-cols-2",
          shown.length === 3 && "grid-cols-[3fr_2fr] grid-rows-2",
        )}
      >
        {shown.map((url, i) => (
          <span
            key={`${i}-${url}`}
            className={cn("relative overflow-hidden bg-avatar", shown.length === 3 && i === 0 && "row-span-2")}
          >
            <FilmImage src={url} alt="" sizes={i === 0 ? "280px" : "180px"} />
          </span>
        ))}
      </div>
    </div>
  );
}

function NextTrip({
  client,
  nextTrip,
  startTripHref,
  today,
}: {
  client: ClientSummary;
  nextTrip: ClientTripCard | null;
  startTripHref: string;
  today: string;
}) {
  return (
    <div className="mx-5 flex items-center gap-3 border-t border-rule py-3.5">
      {nextTrip ? (
        <>
          <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-[10px] bg-avatar">
            {nextTrip.imageUrl ? <FilmImage src={nextTrip.imageUrl} alt="" sizes="56px" /> : null}
          </span>
          <span className="flex min-w-0 grow flex-col">
            <span className="truncate text-ui-sm leading-[18px] text-text-muted">Next trip</span>
            <span className="truncate text-body leading-5 font-semibold text-ink">
              {nextTrip.destinationName || nextTrip.title}
              <span className="font-normal text-text-muted">
                {" "}
                · {tripDatesLabel(nextTrip.startDate, nextTrip.endDate, today) ?? "Dates not set"}
              </span>
            </span>
          </span>
          <span className="shrink-0 rounded-pill border border-pill-outline px-2.5 py-1 text-meta font-semibold text-ink">
            {STAGE_LABEL[computeStage(nextTrip, today)]}
          </span>
        </>
      ) : (
        <>
          <span className="flex min-w-0 grow flex-col">
            <span className="truncate text-ui-sm leading-[18px] text-text-muted">No trip yet</span>
            <span className="truncate text-body leading-5 font-semibold text-ink">
              {client.favoritesCount >= MIN_FAVORITES_FOR_TRIP ? "Ready for a first trip" : "Add their favorites first"}
            </span>
          </span>
          <Link
            href={startTripHref}
            className="relative z-10 shrink-0 rounded-pill bg-ink px-3 py-1.5 text-meta font-semibold text-surface transition-colors hover:bg-text-4"
          >
            Start a trip
          </Link>
        </>
      )}
    </div>
  );
}
