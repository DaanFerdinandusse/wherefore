import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import type { ClientSummary, ClientTripCard } from "@/lib/clients/contracts";
import { computeStage } from "@/lib/trips/stage";
import { cn } from "@/lib/ui/cn";

import { activityLine, firstName, namesLine, plural, STAGE_LABEL, tripDatesLabel } from "../format";
import { InitialsAvatar } from "../initials-avatar";

// One client on the Clients page (H3), as a profile: a collage of the places
// they love, who they are, what they love by name, their taste tags, what
// else they are into, the start of your notes, and the next trip. The whole
// card opens the profile (a stretched link, so a click anywhere and Enter on
// the focused card open it); "Start a trip" sits above it.

const TAGS = 3;
const MEDIA = 2;
const MIN_FAVORITES_FOR_TRIP = 3;

export function ClientCard({
  client,
  nextTrip,
  startTripHref,
  today,
  now,
}: {
  client: ClientSummary;
  nextTrip: ClientTripCard | null;
  /** The current URL with ?new=1&client=<id>, which opens the new trip panel. */
  startTripHref: string;
  today: string;
  now: Date;
}) {
  const where = client.status === "guest" ? "Guest" : null;
  const meta = [where, plural(client.tripCount, "trip"), activityLine(new Date(client.lastActivityAt), new Date(client.createdAt), now)]
    .filter(Boolean)
    .join(" · ");
  const extraTags = Math.max(0, client.tasteTags.length - TAGS);
  const media = client.mediaFavorites.map((item) => item.name ?? item.query).filter(Boolean);
  const notes = client.notesExcerpt.trim();
  const first = firstName(client.name);

  return (
    <li className="group relative flex flex-col rounded-card bg-surface-raised px-2 pt-2 shadow-tile transition-shadow hover:shadow-card">
      <Link
        href={`/clients/${client.id}`}
        aria-label={`Open ${client.name}`}
        className="absolute inset-0 z-[1] rounded-card focus-visible:outline-offset-0"
      />

      <Collage images={client.favoriteImages} emptyLabel={`Add the places ${first} loves`} />

      <div className="flex items-center gap-3.5 px-3 pt-4">
        <InitialsAvatar name={client.name} size={48} />
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <h2 className="truncate font-display text-card-sm leading-[30px] tracking-[-0.01em] text-ink">{client.name}</h2>
          <p className="truncate text-ui-sm text-text-2">{meta}</p>
        </div>
      </div>

      <div className="flex grow flex-col gap-3.5 px-3 py-[18px]">
        <Detail label="Loves">
          {client.favoriteNames.length > 0 ? (
            <p className="line-clamp-2 text-ui leading-[19px] text-ink">{namesLine(client.favoriteNames)}</p>
          ) : (
            <p className="text-ui leading-[19px] text-text-muted">No favorite places yet</p>
          )}
        </Detail>

        <Detail label="Taste" gap="gap-[7px]">
          {client.tasteTags.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-1.5">
              {client.tasteTags.slice(0, TAGS).map((tag) => (
                <li
                  key={tag.tagId}
                  className="rounded-pill border border-ink/14 px-[11px] py-1 text-meta font-medium whitespace-nowrap text-ink"
                >
                  {tag.name}
                </li>
              ))}
              {extraTags > 0 ? <li className="pl-1 text-ui-sm font-semibold text-text-muted">+{extraTags}</li> : null}
            </ul>
          ) : (
            <p className="text-ui leading-[19px] text-text-muted">Tags appear once a place {first} loves is matched</p>
          )}
        </Detail>

        {media.length > 0 ? (
          <Detail label="Also into">
            <p className="truncate text-ui leading-[19px] text-ink">{namesLine(media.slice(0, MEDIA), media.length)}</p>
          </Detail>
        ) : null}

        {notes ? <p className="line-clamp-2 text-ui-sm leading-[18px] text-text-3">{notes}</p> : null}
      </div>

      <NextTrip client={client} nextTrip={nextTrip} startTripHref={startTripHref} today={today} />
    </li>
  );
}

function Detail({ label, gap = "gap-[5px]", children }: { label: string; gap?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col", gap)}>
      <span className="label-caps leading-[14px] text-text-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * Up to three photos of the places they love: one large on the left, two
 * stacked on the right. Fewer photos fill the frame; none leaves a dashed
 * frame that says what to do.
 */
function Collage({ images, emptyLabel }: { images: string[]; emptyLabel: string }) {
  const shown = images.slice(0, 3);
  if (shown.length === 0) {
    return (
      <div className="flex h-42 shrink-0 items-center justify-center gap-2 rounded-row border-[1.5px] border-dashed border-ink/20 bg-canvas/50 text-ui font-semibold text-ink">
        <Plus size={14} strokeWidth={2} aria-hidden />
        {emptyLabel}
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={cn(
        "grid h-42 shrink-0 gap-1 overflow-hidden rounded-row",
        shown.length === 1 && "grid-cols-1",
        shown.length === 2 && "grid-cols-[260fr_162fr]",
        shown.length === 3 && "grid-cols-[260fr_162fr] grid-rows-2",
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
    <div className="flex items-center gap-3 border-t border-ink/8 px-3 py-3.5">
      {nextTrip ? (
        <>
          <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-[10px] bg-avatar">
            {nextTrip.imageUrl ? <FilmImage src={nextTrip.imageUrl} alt="" sizes="56px" /> : null}
          </span>
          <span className="flex min-w-0 grow flex-col gap-px">
            <span className="truncate text-meta text-text-muted">Next trip</span>
            <span className="truncate text-ui leading-[19px] font-semibold text-ink">
              {nextTrip.destinationName || nextTrip.title}
              <span className="font-normal text-text-2">
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
          <span className="flex min-w-0 grow flex-col gap-px">
            <span className="truncate text-meta text-text-muted">{client.tripCount > 0 ? "No trip coming up" : "No trip yet"}</span>
            <span className="truncate text-ui leading-[19px] font-semibold text-ink">
              {client.favoritesCount >= MIN_FAVORITES_FOR_TRIP
                ? client.tripCount > 0
                  ? "Ready for the next one"
                  : "Ready for a first trip"
                : "Add their favorites first"}
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
