import type { Ref } from "react";

import { Avatar } from "@/components/ui/avatar";
import { StarGlyph } from "@/components/ui/match-pill";
import type { GooglePlaceDetails, GoogleReview } from "@/lib/google/contracts";
import { cn } from "@/lib/ui/cn";

import { formatCount, hoursRowLabel, starsLabel, type HoursRow } from "./profile-format";

// The scrolled part of the profile (03b): Hours and Contact side by side, then
// Reviews from Google. Hours come from Google once the full details load,
// else from the provider; the trip days are bold. No Popular times: neither
// source returns them.

const pillLink =
  "inline-flex h-[31px] items-center rounded-pill border border-nav-pill px-3.5 text-ui-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-ink/5";

export function HoursAndContact({
  sectionRef,
  hours,
  address,
  directionsHref,
  website,
  phoneHref,
}: {
  sectionRef: Ref<HTMLElement>;
  hours: HoursRow[];
  address: string | null;
  directionsHref: string;
  website: string | null;
  phoneHref: string | null;
}) {
  return (
    <section ref={sectionRef} className="flex gap-9 border-t border-rule-strong pt-[18px]">
      <div className="flex w-[250px] shrink-0 flex-col gap-2">
        <h3 className="label-caps pb-1 leading-[14px] text-ink">Hours</h3>
        {hours.length > 0 ? (
          <dl className="flex flex-col gap-2">
            {hours.map((row) => {
              const bold = row.tripDays.length > 0;
              return (
                <div key={row.weekday} className={cn("flex justify-between gap-3 text-ui leading-[19px]", bold ? "font-bold text-ink" : "text-text-4")}>
                  <dt className="shrink-0">{hoursRowLabel(row)}</dt>
                  <dd className="text-right">{row.text}</dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="text-ui leading-[19px] text-text-2">Hours are not listed for this place.</p>
        )}
      </div>
      <div className="flex min-w-0 grow flex-col gap-2.5">
        <h3 className="label-caps pb-0.5 leading-[14px] text-ink">Contact</h3>
        {address ? <p className="text-ui leading-[19px] text-text-4">{address}</p> : null}
        <div className="flex flex-wrap gap-2">
          <a href={directionsHref} target="_blank" rel="noreferrer" className={pillLink}>
            Directions
          </a>
          {website ? (
            <a href={website} target="_blank" rel="noreferrer" className={pillLink}>
              Website
            </a>
          ) : null}
          {phoneHref ? (
            <a href={phoneHref} className={pillLink}>
              Call
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <StarGlyph key={i} size={13} className={i < full ? "text-ink" : "text-ink/30"} />
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: GoogleReview }) {
  const author = review.author.displayName ?? "A Google user";
  const meta = [review.rating !== undefined ? starsLabel(review.rating) : null, review.relativeTime].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-rule-strong p-4">
      <div className="flex items-center gap-2.5">
        <Avatar name={author} size={32} />
        <div className="flex min-w-0 flex-col">
          {review.author.uri ? (
            <a href={review.author.uri} target="_blank" rel="noreferrer" className="truncate text-ui-sm leading-4 font-semibold text-ink hover:underline">
              {author}
            </a>
          ) : (
            <span className="truncate text-ui-sm leading-4 font-semibold text-ink">{author}</span>
          )}
          {meta ? <span className="text-meta leading-[15px] text-text-2">{meta}</span> : null}
        </div>
        <span className="ml-auto self-start text-meta text-text-2">From Google</span>
      </div>
      {review.text ? <p className="line-clamp-4 text-ui leading-5 text-text-4">{`“${review.text.trim()}”`}</p> : null}
    </li>
  );
}

export function Reviews({ details, loading }: { details: GooglePlaceDetails | null; loading: boolean }) {
  const reviews = (details?.reviews ?? []).filter((r) => r.text || r.rating !== undefined).slice(0, 3);
  const rating = details?.rating;
  if (!loading && rating === undefined && reviews.length === 0) return null;

  return (
    <section className="flex flex-col gap-[18px] border-t border-rule-strong pt-[18px]">
      <div className="flex items-baseline justify-between">
        <h3 className="label-caps leading-[14px] text-ink">Reviews</h3>
        <span className="text-meta text-text-2">From Google</span>
      </div>
      {rating !== undefined ? (
        <div className="flex items-center gap-4">
          <span className="font-display text-name text-ink">{rating.toFixed(1)}</span>
          <div className="flex flex-col gap-1">
            <Stars rating={rating} />
            {details?.ratingCount !== undefined ? (
              <span className="text-ui-sm text-text-2">{formatCount(details.ratingCount)} reviews</span>
            ) : null}
          </div>
        </div>
      ) : loading ? (
        <p className="text-ui text-text-2">Loading reviews</p>
      ) : null}
      {reviews.length > 0 ? (
        <ul className="flex flex-col gap-3.5">
          {reviews.map((review, i) => (
            <ReviewCard key={`${review.author.displayName ?? ""}-${i}`} review={review} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
