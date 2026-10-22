import { FilmImage } from "@/components/ui/film-image";
import { Pill } from "@/components/ui/pill";
import type { Explainability, TasteTag } from "@/lib/contracts";
import type { TripPlaceProfileDriver } from "@/lib/trips/profile-types";
import { cn } from "@/lib/ui/cn";

import { OTHER_DRIVER_ID, whySentence } from "./profile-format";

// "Why it is recommended for Ana": the score, one sentence from the named
// drivers, a bar per driver (width = its share) and the shared taste tags.
// Everything comes from the explainability data; "Other favorites" is shown
// as the rest of the share, never as a favorite with a photo or in the sentence.

export function WhyBlock({
  clientFirstName,
  score,
  because,
  sharedTags,
  drivers,
}: {
  clientFirstName: string;
  score?: number;
  because: Explainability;
  sharedTags: TasteTag[];
  drivers: TripPlaceProfileDriver[];
}) {
  const byEntity = new Map(drivers.map((d) => [d.entityId, d]));
  const sentence = whySentence(because, new Map(drivers.map((d) => [d.entityId, d.city])));
  if (score === undefined && because.length === 0 && sharedTags.length === 0) return null;

  return (
    <section aria-label={`Why it is recommended for ${clientFirstName}`} className="flex flex-col gap-[18px] rounded-photo bg-avatar p-6">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="label-caps leading-4 text-ink">Why it is recommended for {clientFirstName}</h3>
          {sentence ? <p className="max-w-[340px] text-body leading-[22px] text-ink">{sentence}</p> : null}
        </div>
        {score !== undefined ? (
          <p className="flex shrink-0 items-baseline gap-1">
            <span className="font-display text-place leading-16 text-ink">{score}</span>
            <span className="text-ui-sm font-semibold text-ink">match</span>
          </p>
        ) : null}
      </div>

      {because.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {because.map((driver) => {
            const other = driver.entityId === OTHER_DRIVER_ID;
            const photo = other ? null : byEntity.get(driver.entityId)?.imageUrl;
            return (
              <li key={driver.entityId} className="flex items-center gap-3">
                <span className={cn("relative size-[34px] shrink-0 overflow-hidden rounded-pill", other ? "border border-dashed border-pill-outline" : "bg-surface")}>
                  {photo ? <FilmImage src={photo} alt="" sizes="34px" unoptimized /> : null}
                </span>
                <span title={other ? undefined : driver.name} className={cn("w-[120px] shrink-0 truncate text-body leading-5", other ? "font-medium text-text-2" : "font-semibold text-ink")}>
                  {other ? "Other favorites" : driver.name}
                </span>
                <span className="flex h-2 grow rounded-pill bg-ink/12" aria-hidden>
                  <span className={cn("h-2 rounded-pill", other ? "bg-text-2" : "bg-ink")} style={{ width: `${Math.max(0, Math.min(100, driver.share))}%` }} />
                </span>
                <span className="w-11 shrink-0 text-right text-ui font-semibold text-ink">
                  {driver.share}%<span className="sr-only"> of the match</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {sharedTags.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-ui-sm leading-4 font-semibold text-text-3">Taste tags {clientFirstName} shares with this place</p>
          <ul className="flex flex-wrap gap-2">
            {sharedTags.map((tag) => (
              <li key={tag.tagId}>
                <Pill className="border-nav-pill!">{tag.name}</Pill>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
