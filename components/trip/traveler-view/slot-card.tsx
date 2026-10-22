import type { SharedTripSlot } from "@/lib/contracts";
import { FilmImage } from "@/components/ui/film-image";
import { Pill } from "@/components/ui/pill";

import { becauseLine, slotLabel } from "./format";

const MAX_TAGS = 4;

/** The advisor's slot note, shown only when they marked it for the traveler. */
function AdvisorNote({ note }: { note: string }) {
  return (
    <div className="rounded-row border border-rule-strong bg-surface-raised px-4 py-3">
      <p className="label-caps text-text-2">From your advisor</p>
      <p className="mt-1.5 text-body text-ink">{note}</p>
    </div>
  );
}

function SlotChip({ children }: { children: string }) {
  return (
    <span className="absolute top-4 left-4 rounded-pill border border-white/25 bg-ink/40 px-3 py-1.5 text-ui-sm font-semibold text-white backdrop-blur-[12px]">
      {children}
    </span>
  );
}

// One slot of a day: the place photo with the film grade, its name and
// neighborhood, the favorites that drove it, the taste tags it shares with the
// traveler, and the advisor's note when it is meant for them. A slot with
// only a note (no place) shows the note on its own.
export function SlotCard({ slot, headingLevel = "h3" }: { slot: SharedTripSlot; headingLevel?: "h3" | "h4" }) {
  const Heading = headingLevel;
  const label = slotLabel(slot.slot);
  const place = slot.place;

  if (!place) {
    return (
      <article className="flex flex-col gap-3 rounded-photo border border-dashed border-pill-outline p-5">
        <Heading className="label-caps text-text-2">{label}</Heading>
        {slot.advisorNote ? <AdvisorNote note={slot.advisorNote} /> : null}
      </article>
    );
  }

  const because = becauseLine(place.because);
  const tags = place.sharedTags.slice(0, MAX_TAGS);

  return (
    <article className="flex flex-col gap-3.5">
      <div className="relative h-[260px] overflow-hidden rounded-photo bg-avatar md:h-[300px] lg:h-[320px]">
        {place.imageUrl ? (
          <FilmImage
            src={place.imageUrl}
            alt={place.name}
            sizes="(min-width: 1024px) 416px, (min-width: 768px) 50vw, 100vw"
          />
        ) : null}
        <SlotChip>{label}</SlotChip>
      </div>
      <div className="flex flex-col gap-1">
        <Heading className="text-card-md font-light tracking-[-0.02em] text-ink">{place.name}</Heading>
        {place.neighborhood ? <p className="text-ui text-text-muted">{place.neighborhood}</p> : null}
      </div>
      {because ? <p className="text-body font-semibold text-ink">{because}</p> : null}
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="What you have in common">
          {tags.map((tag) => (
            <li key={tag}>
              <Pill>{tag}</Pill>
            </li>
          ))}
        </ul>
      ) : null}
      {slot.advisorNote ? <AdvisorNote note={slot.advisorNote} /> : null}
    </article>
  );
}
