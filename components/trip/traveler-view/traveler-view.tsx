import { Heart } from "lucide-react";

import type { SharedFavorite, SharedTripDay, SharedTripView } from "@/lib/contracts";
import { CoverCredit } from "@/components/ui/cover-credit";
import { FilmImage } from "@/components/ui/film-image";
import { cn } from "@/lib/ui/cn";

import {
  bandHeading,
  dateRangeLabel,
  dayLayouts,
  dayTitle,
  favoriteImage,
  favoritesBehind,
  tasteLetter,
  heroImage,
  heroIntro,
  nightsOf,
  photoFrames,
  placeImages,
  pageReasons,
  rowFrames,
  splitStays,
  stayFacts,
  type StayEntry,
  withoutHero,
} from "./format";
import { AdvisorInitials, AdvisorNote, FavoritePhoto, LovedFor, PhotoRow, ReasonRow, StayFacts } from "./parts";
import { PhotoCredit } from "./photo-credit";
import { PlaceBlock, PlaceColumn } from "./place-block";

// The itinerary as the traveler sees it (Paper "K1 Traveler itinerary"): a
// hero with the city photo and a short letter, the favorites the picks were
// built from, one section per planned day, the stay, and a footer with the
// advisor. The same page renders at /s/[token] and in the workspace's
// full-screen traveler view. Layout follows the width of the component
// (container queries), not the window. Free days are not shown. No state and
// no server-only imports, so it renders on either side.

const GUTTER = "px-4 @3xl:px-10 @5xl:px-16";

type Reasons = ReturnType<typeof pageReasons>;

function Wordmark() {
  // The Wordmark component links to the advisor's Trips page; a traveler has no account there.
  return <span className="font-display text-wordmark-sm text-ink">Wherefore</span>;
}

function Hero({ view, image }: { view: SharedTripView; image: ReturnType<typeof heroImage> }) {
  const dates = dateRangeLabel(view.startDate, view.endDate);
  const intro = tasteLetter(view) ?? heroIntro(view);
  const advisor = view.advisorName?.trim();

  return (
    <section
      className={cn(
        "flex flex-col @5xl:grid @5xl:min-h-[760px] @5xl:grid-rows-[auto_1fr]",
        image ? "@5xl:grid-cols-[780fr_660fr]" : "@5xl:grid-cols-1",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-4 py-5 @5xl:pt-12 @5xl:pb-0",
          GUTTER,
          image && "@5xl:col-start-2 @5xl:row-start-1",
        )}
      >
        <Wordmark />
        {dates ? <p className="text-ui-sm text-text-muted">{dates}</p> : null}
      </div>
      {image ? (
        <div className="relative mx-4 aspect-4/5 overflow-hidden rounded-photo bg-avatar @3xl:mx-10 @3xl:aspect-16/10 @5xl:col-start-1 @5xl:row-span-2 @5xl:row-start-1 @5xl:mx-0 @5xl:aspect-auto @5xl:rounded-none">
          {/* The largest photo on the page, shown as it is: the film grade flattens it. */}
          <FilmImage src={image.photo.src} alt={image.alt} priority sizes="(min-width: 1024px) 55vw, 100vw" className="filter-none!" />
          {image.photo.credit ? <PhotoCredit credit={image.photo.credit} /> : null}
          {image.cover ? <CoverCredit cover={image.cover} className="absolute right-3 bottom-3 rounded-pill bg-ink/50 px-2.5 py-1 text-white" /> : null}
        </div>
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-6 pt-8 pb-12 @3xl:gap-7 @5xl:self-end @5xl:pt-16 @5xl:pb-14",
          GUTTER,
          image && "@5xl:col-start-2 @5xl:row-start-2",
        )}
      >
        <h1 className="font-display text-name text-ink @3xl:text-hero">
          {view.destinationName},
          <br />
          for {view.preparedFor}
        </h1>
        {intro ? (
          <p className="max-w-[470px] font-display text-reason-sm text-text-4 italic @3xl:text-intro">{intro}</p>
        ) : null}
        {advisor ? (
          <div className="flex items-center gap-3">
            <AdvisorInitials name={advisor} size={40} />
            <p className="flex flex-col">
              <span className="text-ui-sm text-text-muted">Prepared by</span>
              <span className="text-action font-semibold text-ink">{advisor}</span>
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FavoritesBand({ favorites, heading }: { favorites: SharedFavorite[]; heading: string }) {
  return (
    <section
      className={cn(
        "flex flex-col gap-7 bg-sand py-10 @5xl:flex-row @5xl:items-center @5xl:justify-between @5xl:py-11",
        GUTTER,
      )}
    >
      <div className="flex max-w-[460px] flex-col gap-3">
        <p className="flex items-center gap-2 text-ui-sm font-semibold tracking-[0.08em] text-amber uppercase">
          <Heart aria-hidden className="size-4" strokeWidth={2} />
          Built from your favorites
        </p>
        <h2 className="max-w-[420px] font-display text-card-sm text-ink @3xl:text-card-md">
          {heading}
        </h2>
      </div>
      {/* One row: on a phone it scrolls sideways instead of wrapping. */}
      <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 py-1.5 @3xl:mx-0 @3xl:gap-7 @3xl:overflow-visible @3xl:px-0">

        {favorites.map((favorite) => (
          <li key={favorite.name} className="flex w-[76px] flex-col items-center gap-2.5 text-center">
            <FavoritePhoto name={favorite.name} src={favorite.imageUrl} ring="band" className="size-[64px] @3xl:size-[76px]" />
            <span className="text-ui-sm font-semibold text-ink">{favorite.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayHeader({ day }: { day: SharedTripDay }) {
  const { title, detail } = dayTitle(day);
  return (
    <header className="flex flex-col gap-1 border-b border-rule-strong pb-4 @3xl:flex-row @3xl:items-baseline @3xl:gap-6 @3xl:pb-5">
      <h2 className="font-display text-title text-ink @3xl:text-day">{title}</h2>
      {detail ? <p className="text-body-lg text-text-3 @3xl:text-prose">{detail}</p> : null}
    </header>
  );
}

function DaySection(props: {
  day: SharedTripDay;
  layout: "stack" | "row";
  favorites: SharedFavorite[];
  reasons: Reasons;
  advisorName: string | null;
  heroSrc?: string;
  firstBlock: number;
}) {
  const { day, layout, favorites, reasons, advisorName, heroSrc, firstBlock } = props;
  if (layout === "row") {
    const frames = rowFrames(day.slots.length);
    return (
      <section className={cn("flex flex-col gap-8 pt-14 pb-16 @3xl:gap-10 @3xl:pt-[72px] @3xl:pb-24", GUTTER)}>
        <DayHeader day={day} />
        <div className="flex flex-col gap-12 @3xl:flex-row @3xl:items-start @3xl:gap-8">
          {day.slots.map((slot, i) => (
            <PlaceColumn
              key={`${slot.slot}-${slot.position}`}
              slot={slot}
              favorites={favorites}
              reasons={reasons}
              advisorName={advisorName}
              heroSrc={heroSrc}
              frame={frames[i] ?? { ratio: "1 / 1", grow: 1 }}
            />
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className={cn("flex flex-col gap-12 pt-16 pb-10 @3xl:gap-[88px] @3xl:pt-[104px]", GUTTER)}>
      <DayHeader day={day} />
      {day.slots.map((slot, i) => (
        <PlaceBlock
          key={`${slot.slot}-${slot.position}`}
          slot={slot}
          favorites={favorites}
          reasons={reasons}
          advisorName={advisorName}
          heroSrc={heroSrc}
          index={firstBlock + i}
        />
      ))}
    </section>
  );
}

function StaySection({
  stay,
  nights,
  favorites,
  reasons,
  advisorName,
  heroSrc,
}: {
  stay: StayEntry;
  nights: number | null;
  favorites: SharedFavorite[];
  reasons: Reasons;
  advisorName: string | null;
  heroSrc?: string;
}) {
  const { place } = stay;
  // Two photos at most, as a wide pair.
  const frames = photoFrames(withoutHero(placeImages(place), heroSrc).slice(0, 2), 2);
  const reason = reasons.get(place) ?? null;
  const facts = stayFacts(place, nights);
  const keywords = place.keywords ?? [];

  return (
    <section className={cn("flex flex-col gap-8 bg-sand py-16 @3xl:gap-10 @3xl:py-[104px]", GUTTER)}>
      <h2 className="font-display text-title text-ink @3xl:text-day">You stay at {place.name}</h2>
      <PhotoRow frames={frames} place={place} />
      <div className="flex flex-col gap-7 @5xl:flex-row @5xl:items-start @5xl:gap-20">
        <div className="min-w-0 flex-1">
          {reason ? (
            <ReasonRow text={reason.text} favorite={reason.favorite} favoriteSrc={favoriteImage(favorites, reason.favorite)} />
          ) : place.neighborhood ? (
            <p className="text-action font-semibold text-amber">{place.neighborhood}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-5 @5xl:w-[540px] @5xl:shrink-0 @5xl:pt-1.5">
          {facts ? <StayFacts text={facts} /> : null}
          {place.description ? <p className="text-body-lg text-text-3 @3xl:text-prose">{place.description}</p> : null}
          {keywords.length > 0 ? <LovedFor keywords={keywords} /> : null}
          {stay.advisorNote ? <AdvisorNote note={stay.advisorNote} advisorName={advisorName} /> : null}
        </div>
      </div>
    </section>
  );
}

function Footer({ view }: { view: SharedTripView }) {
  const advisor = view.advisorName?.trim();
  const first = advisor?.split(/\s+/)[0];
  const subject = encodeURIComponent(view.title);
  return (
    <footer
      className={cn(
        "flex flex-col gap-6 border-t border-rule pt-12 pb-14 @3xl:flex-row @3xl:items-center @3xl:justify-between @3xl:pt-14 @3xl:pb-16",
        GUTTER,
      )}
    >
      <div className="flex items-center gap-4">
        {advisor ? <AdvisorInitials name={advisor} size={52} /> : null}
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-card-sm text-ink">Want to change something?</h2>
          <p className="text-body text-text-3">
            {advisor ? `${advisor} plans this trip for you.` : "Your advisor plans this trip for you."}
          </p>
        </div>
      </div>
      {view.advisorEmail ? (
        <a
          href={`mailto:${view.advisorEmail}?subject=${subject}`}
          className="self-start rounded-pill bg-ink px-[22px] py-[13px] text-action font-semibold text-white transition-colors hover:bg-text-4 @3xl:self-auto"
        >
          {first ? `Message ${first}` : "Message your advisor"}
        </a>
      ) : null}
    </footer>
  );
}

export function TravelerView({ view }: { view: SharedTripView }) {
  const { days, stays } = splitStays(view);
  const layouts = dayLayouts(days);
  const favorites = favoritesBehind(view);
  const image = heroImage(view);
  const heroSrc = image?.src;
  const nights = stays.length === 1 ? nightsOf(view.startDate, view.endDate) : null;
  // Block numbers run across days, so photo layouts rotate over the whole page.
  const firstBlocks = days.map((_, i) => days.slice(0, i).reduce((sum, day) => sum + day.slots.length, 0));
  const reasons = pageReasons([
    ...days.flatMap((day) => day.slots.flatMap((slot) => (slot.place ? [slot.place] : []))),
    ...stays.map((stay) => stay.place),
  ]);

  return (
    <div className="@container min-h-dvh bg-surface text-ink">
      <div className="mx-auto max-w-[1440px]">
        <Hero view={view} image={image} />
        {favorites.length > 0 ? (
          <FavoritesBand favorites={favorites} heading={bandHeading(view)} />
        ) : null}
        {days.length === 0 && stays.length === 0 ? (
          <p className={cn("py-16 text-body-lg text-text-2", GUTTER)}>
            Your days are still being planned. Open this link again soon.
          </p>
        ) : null}
        {days.map((day, i) => (
          <DaySection
            key={day.day}
            day={day}
            layout={layouts[i] ?? "stack"}
            favorites={favorites}
            reasons={reasons}
            advisorName={view.advisorName}
            heroSrc={heroSrc}
            firstBlock={firstBlocks[i] ?? 0}
          />
        ))}
        {stays.map((stay) => (
          <StaySection
            key={stay.place.name}
            stay={stay}
            nights={nights}
            favorites={favorites}
            reasons={reasons}
            advisorName={view.advisorName}
            heroSrc={heroSrc}
          />
        ))}
        <Footer view={view} />
      </div>
    </div>
  );
}
