import type { CSSProperties } from "react";

import type { SharedFavorite, SharedTripPlace, SharedTripSlot } from "@/lib/contracts";

import { favoriteImage, photoFrames, placeImages, type ReasonLine, slotLine, withoutHero } from "./format";
import { AdvisorNote, DishesChip, LovedFor, PhotoRow, ReasonRow } from "./parts";
import { PhotoFrame } from "./photo-frame";

// One place of a day, in two sizes (Paper K1). The wide block gives a place
// one to three photos across the page, then its name and slot on the left
// with the reason, and on the right the provider's description, what
// reviews love it for, the dishes to order and the advisor's note. The
// column sets two or three places side by side with one photo each.
// Everything shown is a fact from the shared view; a missing fact hides its
// line.

type Heading = "h3" | "h4";

type BlockProps = {
  slot: SharedTripSlot;
  favorites: readonly SharedFavorite[];
  reasons: ReadonlyMap<SharedTripPlace, ReasonLine | null>;
  advisorName: string | null;
  headingLevel: Heading;
  heroSrc?: string;
};

function frameStyle(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties;
}

/** A slot with only a note from the advisor: no place, so no photos. */
export function NoteBlock({ slot, advisorName, headingLevel }: Omit<BlockProps, "favorites" | "reasons" | "heroSrc">) {
  const Heading = headingLevel;
  if (!slot.advisorNote) return null;
  return (
    <article className="flex max-w-[640px] flex-col gap-3">
      <Heading className="text-action font-semibold text-amber">{slotLine(slot)}</Heading>
      <AdvisorNote note={slot.advisorNote} advisorName={advisorName} />
    </article>
  );
}

export function PlaceBlock({ slot, favorites, reasons, advisorName, headingLevel, heroSrc, index }: BlockProps & { index: number }) {
  const Heading = headingLevel;
  const place = slot.place;
  if (!place) return <NoteBlock slot={slot} advisorName={advisorName} headingLevel={headingLevel} />;
  const frames = photoFrames(withoutHero(placeImages(place), heroSrc), index);
  const reason = reasons.get(place) ?? null;
  const keywords = place.keywords ?? [];
  const dishes = place.dishes ?? [];
  const hasAside = Boolean(place.description || keywords.length > 0 || dishes.length > 0 || slot.advisorNote);

  return (
    <article className="flex flex-col gap-6 @3xl:gap-9">
      <PhotoRow frames={frames} alt={place.name} />
      <div className="flex flex-col gap-7 @5xl:flex-row @5xl:items-start @5xl:gap-20">
        <div className="flex min-w-0 flex-1 flex-col gap-5 @3xl:gap-6">
          <div className="flex flex-col gap-2">
            <Heading className="font-display text-card-md text-ink @3xl:text-card-lg">{place.name}</Heading>
            <p className="text-action font-semibold text-amber">{slotLine(slot)}</p>
          </div>
          {reason ? (
            <ReasonRow
              text={reason.text}
              favorite={reason.favorite}
              favoriteSrc={favoriteImage(favorites, reason.favorite)}
            />
          ) : null}
        </div>
        {hasAside ? (
          <div className="flex flex-col gap-5 @5xl:w-[540px] @5xl:shrink-0 @5xl:pt-2.5">
            {place.description ? <p className="text-body-lg text-text-3 @3xl:text-prose">{place.description}</p> : null}
            {keywords.length > 0 ? <LovedFor keywords={keywords} /> : null}
            {dishes.length > 0 ? <DishesChip dishes={dishes} /> : null}
            {slot.advisorNote ? <AdvisorNote note={slot.advisorNote} advisorName={advisorName} /> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** One place in a row of two or three: one photo, then the words stacked under it. */
export function PlaceColumn({
  slot,
  favorites,
  reasons,
  advisorName,
  headingLevel,
  heroSrc,
  frame,
}: BlockProps & { frame: { ratio: string; grow: number } }) {
  const Heading = headingLevel;
  const place = slot.place;
  if (!place) return null;
  const src = withoutHero(placeImages(place), heroSrc)[0];
  const reason = reasons.get(place) ?? null;
  const keywords = place.keywords ?? [];
  const dishes = place.dishes ?? [];

  return (
    <article
      style={frameStyle({ "--r-wide": frame.ratio, "--g": frame.grow })}
      className="flex flex-col gap-[18px] @3xl:basis-0 @3xl:grow-(--g)"
    >
      {src ? (
        <PhotoFrame
          src={src}
          alt={place.name}
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="aspect-4/5 w-full @3xl:aspect-(--r-wide)"
        />
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Heading className="font-display text-card-md text-ink @5xl:text-section">{place.name}</Heading>
        <p className="text-action font-semibold text-amber">{slotLine(slot)}</p>
      </div>
      {reason ? (
        <ReasonRow
          text={reason.text}
          favorite={reason.favorite}
          favoriteSrc={favoriteImage(favorites, reason.favorite)}
          compact
        />
      ) : null}
      {place.description ? <p className="text-body text-text-3">{place.description}</p> : null}
      {keywords.length > 0 ? <LovedFor keywords={keywords} compact /> : null}
      {dishes.length > 0 ? <DishesChip dishes={dishes} /> : null}
      {slot.advisorNote ? <AdvisorNote note={slot.advisorNote} advisorName={advisorName} /> : null}
    </article>
  );
}
