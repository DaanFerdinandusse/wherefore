"use client";

import { Banknote, CalendarDays, Check, CircleDashed, Clock, ExternalLink, MapPin, MessageCircle, Star, X } from "lucide-react";
import type { ReactNode } from "react";

import type { SlotTarget, TripPlaceCard, TripSnapshot } from "@/lib/contracts";
import type { GooglePlaceDetails } from "@/lib/google/contracts";
import type { TripPlaceProfilePlace } from "@/lib/trips/profile-types";
import { cn } from "@/lib/ui/cn";

import {
  highlightSegments,
  hoursOnDate,
  openForSlot,
  priceRangeLabel,
  reservationLine,
  reviewsNewestFirst,
  shortAuthor,
  shortDateLabel,
} from "./card-format";
import { directionsUrl, formatCount, googleHoursRows, hoursRowLabel, shortAddress, tripDays } from "./profile-format";

// The card's Visit info (J1b) and Reviews (J1c) tabs. Facts from Google carry
// their source ("From Google · checked today": they are read live when the
// tab opens, never stored). What Google does not list says so in a quiet
// line (S4 Information states); nothing is guessed. No busy-times chart and
// no rating distribution: Google returns neither. While Google answers, both
// tabs hold their full size: the sections stand and shimmering lines wait in
// the rows, so the card does not grow when the facts arrive.

const BOX = "flex flex-col rounded-card bg-surface-raised px-4.5 py-4 shadow-soft";
const REVIEW_ROWS = 5;
const WEEK_DAYS = 7;

function Line({ className }: { className: string }) {
  return <span aria-hidden className={cn("skeleton-shimmer block rounded-pill", className)} />;
}

function GoogleMark({ text = "From Google" }: { text?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-meta font-medium text-text-2">
      <MapPin aria-hidden className="size-3.5" strokeWidth={2} />
      {text}
    </span>
  );
}

function Row({ icon, children, trailing, muted }: { icon: ReactNode; children: ReactNode; trailing?: ReactNode; muted?: boolean }) {
  return (
    <div className="flex min-h-8.5 items-center gap-2.5 py-1">
      <span className={cn("flex size-4 shrink-0 items-center justify-center", muted ? "text-text-muted" : "text-text-3")}>{icon}</span>
      <div className={cn("min-w-0 grow text-body leading-5", muted ? "text-text-2" : "font-semibold text-ink")}>{children}</div>
      {trailing}
    </div>
  );
}

function PendingRow({ icon: Icon, width }: { icon: typeof Clock; width: string }) {
  return (
    <Row icon={<Icon aria-hidden className="size-4" strokeWidth={2} />} muted>
      <Line className={cn("h-3.5", width)} />
    </Row>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <span className="font-normal text-text-2">{children}</span>;
}

function PendingHours() {
  return (
    <section className={cn(BOX, "grow-4 basis-0 gap-0.5")} aria-label="Opening hours" data-testid="place-card-hours-pending">
      <div className="flex items-center justify-between pb-1.5">
        <h4 className="text-ui leading-4.5 font-semibold text-text-3">Opening hours</h4>
        <Line className="h-3 w-20" />
      </div>
      <ul className="flex flex-col">
        {Array.from({ length: WEEK_DAYS }, (_, index) => (
          <li key={index} className="flex min-h-7 items-center justify-between gap-3">
            <Line className="h-3 w-14" />
            <Line className="h-3 w-22" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PendingReviews() {
  return (
    <div className="flex gap-3 @max-[600px]:flex-col" data-testid="place-card-reviews">
      <span role="status" className="sr-only">
        Reading reviews on Google
      </span>
      <section className={cn(BOX, "w-59 shrink-0 gap-3")}>
        <Line className="h-3 w-36" />
        <div className="flex items-end gap-2.5">
          <Line className="h-13 w-20 rounded-lg" />
          <Line className="mb-2 h-3.5 w-20" />
        </div>
      </section>

      <section className={cn(BOX, "min-w-0 grow basis-0 gap-0.5")}>
        <div className="flex items-center justify-between pb-1.5">
          <h4 className="flex items-center gap-2 text-ui leading-4.5 font-semibold text-text-3">
            <MessageCircle aria-hidden className="size-4 text-amber" strokeWidth={2} />
            Newest first
          </h4>
          <Line className="h-3 w-28" />
        </div>
        <ul>
          {Array.from({ length: REVIEW_ROWS }, (_, index) => (
            <li key={index} className="flex items-center gap-2.5 border-t border-ink/6 py-2.5">
              <Line className="h-3.5 w-7 shrink-0" />
              <span className="flex h-10 min-w-0 grow flex-col justify-center gap-2.5">
                <Line className="h-3 w-full" />
                <Line className="h-3 w-3/4" />
              </span>
              <span className="flex w-28 shrink-0 justify-end">
                <Line className="h-3 w-20" />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function VisitPanel({
  card,
  place,
  details,
  loading,
  target,
  trip,
  client,
}: {
  card: TripPlaceCard;
  place: TripPlaceProfilePlace | null;
  details: GooglePlaceDetails | null;
  loading: boolean;
  target?: SlotTarget;
  trip: TripSnapshot["trip"];
  client: string;
}) {
  const date = target?.date;
  const dayHours = hoursOnDate(details?.openingHours, date);
  const open = target ? openForSlot(dayHours, target.slot) : null;
  const address = details?.address ?? place?.address ?? card.address ?? null;
  const street = shortAddress(address);
  const neighborhood = card.neighborhood ?? place?.neighborhood ?? null;
  const reservations = reservationLine(details?.reservable);
  const price = priceRangeLabel(details?.priceRange);
  const days = tripDays(trip, []);
  const week = details?.openingHours?.length ? googleHoursRows(details.openingHours, days) : [];
  const features = card.category === "stay" ? (place?.features ?? []) : [];
  const title = date ? `For ${shortDateLabel(date)}` : "Visit facts";

  return (
    <div className="flex gap-3 @max-[600px]:flex-col" data-testid="place-card-visit">
      {loading ? (
        <span role="status" className="sr-only">
          Checking hours on Google
        </span>
      ) : null}
      <section className={cn(BOX, "grow-5 basis-0 gap-0.5")}>
        <div className="flex items-center justify-between gap-2 pb-1.5">
          <h4 className="flex items-center gap-2 text-ui leading-4.5 font-semibold text-text-3">
            <Clock aria-hidden className="size-4 text-amber" strokeWidth={2} />
            {title}
          </h4>
          {details ? <GoogleMark text="From Google · checked today" /> : loading ? <Line className="h-3 w-40" /> : null}
        </div>

        {loading ? (
          <>
            {date ? <PendingRow icon={CalendarDays} width="w-44" /> : null}
            <PendingRow icon={Star} width="w-52" />
            <PendingRow icon={ExternalLink} width="w-36" />
          </>
        ) : date && dayHours ? (
          <Row
            icon={<CalendarDays aria-hidden className="size-4" strokeWidth={2} />}
            trailing={
              open === null ? null : (
                <span
                  data-testid="slot-open-check"
                  className={cn(
                    "flex shrink-0 items-center gap-1.25 rounded-pill px-2 py-0.5 text-meta font-semibold",
                    open ? "bg-why text-amber" : "bg-track text-text-3",
                  )}
                >
                  {open ? <Check aria-hidden className="size-3" strokeWidth={2.6} /> : <X aria-hidden className="size-3" strokeWidth={2.6} />}
                  {open ? `Open for ${client}'s slot` : `Closed for ${client}'s slot`}
                </span>
              )
            }
          >
            {dayHours.weekday} {dayHours.text}
          </Row>
        ) : details && !details.openingHours?.length ? (
          <Row icon={<CircleDashed aria-hidden className="size-4" strokeWidth={2} />} muted>
            Hours not listed on Google
          </Row>
        ) : null}

        {details?.rating !== undefined ? (
          <Row icon={<Star aria-hidden className="size-4" strokeWidth={2} />}>
            {details.rating.toFixed(1)}{" "}
            {details.ratingCount !== undefined ? <Quiet>· {formatCount(details.ratingCount)} Google reviews</Quiet> : null}
          </Row>
        ) : null}

        {reservations ? (
          <Row icon={<ExternalLink aria-hidden className="size-4" strokeWidth={2} />}>{reservations}</Row>
        ) : null}

        {street ? (
          <Row
            icon={<MapPin aria-hidden className="size-4" strokeWidth={2} />}
            trailing={
              <a
                href={directionsUrl(card.name, place?.googlePlaceId, address)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-ui font-semibold text-ink underline decoration-ink/40 underline-offset-2"
              >
                Directions
              </a>
            }
          >
            {street} {neighborhood ? <Quiet>· {neighborhood}</Quiet> : null}
          </Row>
        ) : loading ? (
          <PendingRow icon={MapPin} width="w-60" />
        ) : null}

        {details ? (
          price ? (
            <Row icon={<Banknote aria-hidden className="size-4" strokeWidth={2} />}>{price}</Row>
          ) : (
            <Row icon={<CircleDashed aria-hidden className="size-4" strokeWidth={2} />} muted>
              Price per person not listed on Google
            </Row>
          )
        ) : loading ? (
          <PendingRow icon={Banknote} width="w-44" />
        ) : null}

        {!loading && !details && !street ? <p className="py-1 text-ui text-text-2">No visit facts for this place yet.</p> : null}
      </section>

      {features.length > 0 ? (
        <section className={cn(BOX, "grow-4 basis-0 gap-0.5")} aria-label="At the hotel">
          <h4 className="flex items-center gap-2 pb-1.5 text-ui leading-4.5 font-semibold text-text-3">At the hotel</h4>
          <ul>
            {features.map((feature) => (
              <li key={feature} className="flex min-h-8.5 items-center gap-2.5 text-body font-semibold text-ink">
                <Check aria-hidden className="size-4 text-text-3" strokeWidth={2} />
                {feature}
              </li>
            ))}
          </ul>
        </section>
      ) : loading ? (
        <PendingHours />
      ) : week.length > 0 ? (
        <section className={cn(BOX, "grow-4 basis-0 gap-0.5")} aria-label="Opening hours">
          <div className="flex items-center justify-between pb-1.5">
            <h4 className="text-ui leading-4.5 font-semibold text-text-3">Opening hours</h4>
            <GoogleMark />
          </div>
          <ul className="flex flex-col">
            {week.map((row) => (
              <li key={row.weekday} className="flex min-h-7 items-center justify-between gap-3 text-ui">
                <span className={cn(row.tripDays.length ? "font-semibold text-ink" : "text-text-2")}>{hoursRowLabel(row)}</span>
                <span className={cn("text-right", row.tripDays.length ? "font-semibold text-ink" : "text-text-2")}>{row.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function ReviewsPanel({
  details,
  loading,
  terms,
}: {
  details: GooglePlaceDetails | null;
  loading: boolean;
  terms: string[];
}) {
  if (loading) return <PendingReviews />;
  const reviews = reviewsNewestFirst(details?.reviews).slice(0, 5);
  if (!details || (details.rating === undefined && reviews.length === 0)) {
    return (
      <div className={cn(BOX, "flex-row items-center gap-2.5")} data-testid="place-card-reviews">
        <CircleDashed aria-hidden className="size-4 text-text-muted" strokeWidth={2} />
        <span className="text-ui text-text-2">No reviews listed on Google</span>
      </div>
    );
  }
  const stars = Math.round(details.rating ?? 0);

  return (
    <div className="flex gap-3 @max-[600px]:flex-col" data-testid="place-card-reviews">
      {details.rating !== undefined ? (
        <section className={cn(BOX, "w-59 shrink-0 gap-3")}>
          <GoogleMark text={details.ratingCount !== undefined ? `${formatCount(details.ratingCount)} reviews on Google` : "On Google"} />
          <div className="flex items-end gap-2.5">
            <span className="font-display text-[56px] leading-13 tracking-[-0.02em] text-ink">{details.rating.toFixed(1)}</span>
            <span className="flex gap-0.5 pb-2" aria-label={`${details.rating.toFixed(1)} of 5 stars`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} aria-hidden className={cn("size-3.5", n <= stars ? "fill-amber-dot text-amber-dot" : "fill-ink/12 text-transparent")} strokeWidth={0} />
              ))}
            </span>
          </div>
        </section>
      ) : null}

      <section className={cn(BOX, "min-w-0 grow basis-0 gap-0.5")}>
        <div className="flex items-center justify-between pb-1.5">
          <h4 className="flex items-center gap-2 text-ui leading-4.5 font-semibold text-text-3">
            <MessageCircle aria-hidden className="size-4 text-amber" strokeWidth={2} />
            Newest first
          </h4>
          {details.mapsUrl ? (
            <a
              href={details.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ui font-semibold text-ink underline decoration-ink/40 underline-offset-2"
            >
              Read all on Google
            </a>
          ) : null}
        </div>
        {reviews.length === 0 ? (
          <p className="border-t border-ink/6 py-2.5 text-ui text-text-2">No review texts listed on Google</p>
        ) : (
          <ul>
            {reviews.map((review, index) => {
              const author = shortAuthor(review.author.displayName);
              return (
                <li key={`${review.publishTime ?? ""}-${index}`} className="flex items-center gap-2.5 border-t border-ink/6 py-2.5">
                  {review.rating !== undefined ? (
                    <span className="flex w-8.5 shrink-0 items-center gap-0.75 text-ui font-bold text-ink">
                      {review.rating}
                      <Star aria-hidden className="size-3 fill-amber-dot text-amber-dot" strokeWidth={0} />
                    </span>
                  ) : null}
                  <p className="line-clamp-2 min-w-0 grow text-body leading-5 text-ink">
                    {highlightSegments(review.text ?? "", terms).map((segment, i) =>
                      segment.hit ? (
                        <mark key={i} className="bg-transparent font-bold text-amber">
                          {segment.text}
                        </mark>
                      ) : (
                        <span key={i}>{segment.text}</span>
                      ),
                    )}
                  </p>
                  <span className="w-28 shrink-0 text-right text-ui-sm text-text-2">
                    {[author, review.relativeTime].filter(Boolean).join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
