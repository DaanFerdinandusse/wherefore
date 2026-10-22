import type { SharedTripDay, SharedTripView } from "@/lib/contracts";
import { ArchPhoto } from "@/components/ui/arch-photo";
import { StarburstOrnament } from "@/components/ui/starburst-ornament";
import { cn } from "@/lib/ui/cn";

import {
  dateRangeLabel,
  dayHeading,
  dayNeighborhoods,
  favoritesBehind,
  groupDays,
  heroImage,
  heroSummary,
  joinNames,
  travelerDays,
} from "./format";
import { SlotCard } from "./slot-card";

// The itinerary as the traveler sees it (Paper "05 Traveler view"). The same
// body renders on the public page /s/[token] and inside the workspace's
// "Traveler view" tab; `embedded` drops the share bar, the page width and
// moves every heading one level down so the workspace keeps its own h1.
// No state and no server-only imports, so it renders on either side.

const GUTTER = "px-4 md:px-10 lg:px-16";

type Levels = { title: "h1" | "h2"; day: "h2" | "h3"; slot: "h3" | "h4" };

function ShareBar({ view }: { view: SharedTripView }) {
  const advisor = view.advisorName?.trim();
  return (
    <header className="border-b border-rule">
      <div className={cn("mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 md:h-16", GUTTER)}>
        {/* The Wordmark component links to the advisor's Trips page; a traveler has no account there. */}
        <span className="font-display text-wordmark leading-8 whitespace-nowrap text-ink tracking-[-0.03em]">
          Tastebrief
        </span>
        <p className="flex min-w-0 flex-col items-end text-right text-ui-sm md:flex-row md:items-baseline md:gap-1.5 md:text-ui">
          <span className="font-semibold text-ink">Prepared for {view.preparedFor}</span>
          {advisor ? <span className="truncate text-text-muted">by {advisor}</span> : null}
        </p>
      </div>
    </header>
  );
}

function Hero({ view, level }: { view: SharedTripView; level: Levels["title"] }) {
  const Title = level;
  const image = heroImage(view);
  const dates = dateRangeLabel(view.startDate, view.endDate);
  const favorites = favoritesBehind(view);
  const eyebrow = [`For ${view.preparedFor}`, dates].filter(Boolean).join(" · ");

  return (
    <section
      className={cn(
        "grid gap-7 pt-5 md:pt-10 lg:items-end lg:gap-16 lg:pt-16",
        image && "lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]",
        GUTTER,
      )}
    >
      <div className="order-2 flex flex-col gap-4 lg:order-1 lg:pb-4">
        <p className="text-body font-semibold tracking-[0.02em] text-text-3">{eyebrow}</p>
        <Title className="font-display text-title text-balance text-ink md:text-name lg:text-hero">{view.title}</Title>
        <p className="max-w-[560px] text-body-lg text-text-3">{heroSummary(view)}</p>
        {favorites.length > 0 ? (
          <p className="max-w-[560px] text-ui text-text-2">
            <span className="font-semibold text-ink">Chosen from the places you already love: </span>
            {joinNames(favorites)}
          </p>
        ) : null}
      </div>
      {image ? (
        <ArchPhoto
          src={image.src}
          alt={image.alt}
          priority
          sizes="(min-width: 1024px) 440px, (min-width: 768px) 60vw, 100vw"
          className="order-1 mx-auto aspect-square w-full max-w-[440px] md:aspect-[4/5] lg:order-2 lg:mx-0"
        />
      ) : null}
    </section>
  );
}

function PlannedDay({ day, levels }: { day: SharedTripDay; levels: Levels }) {
  const Heading = levels.day;
  const neighborhoods = dayNeighborhoods(day.slots);
  return (
    <section className={cn("pt-14 lg:pt-20", GUTTER)}>
      <header className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-5">
        <Heading className="font-display text-section text-ink md:text-title">{dayHeading(day)}</Heading>
        <p className="text-body-lg text-text-muted">
          Day {day.day}
          {neighborhoods ? ` · ${neighborhoods}` : null}
        </p>
      </header>
      <ul className="mt-6 grid gap-10 md:mt-7 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
        {day.slots.map((slot) => (
          <li key={`${slot.slot}-${slot.position}`}>
            <SlotCard slot={slot} headingLevel={levels.slot} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FreeDays({ days, levels }: { days: SharedTripDay[]; levels: Levels }) {
  const Heading = levels.day;
  return (
    <section className={cn("pt-14 lg:pt-20", GUTTER)}>
      <ul className="grid gap-3 md:grid-cols-2 md:gap-4">
        {days.map((day) => (
          <li key={day.day} className="flex flex-col gap-1 rounded-photo bg-avatar/70 px-5 py-4 md:px-6 md:py-5">
            <Heading className="font-display text-wordmark leading-[34px] text-ink">{dayHeading(day)}</Heading>
            <p className="text-ui text-text-2">
              <span className="font-semibold text-ink">Day {day.day} · Free day.</span> Nothing planned, so the day
              is yours.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Footer({ view }: { view: SharedTripView }) {
  const advisor = view.advisorName?.trim();
  return (
    <footer className={cn("mt-20 flex flex-col items-center gap-4 border-t border-rule py-14 text-center lg:mt-24", GUTTER)}>
      <StarburstOrnament size={44} />
      <p className="font-display text-wordmark text-balance text-ink">Built from what you already love</p>
      {advisor ? (
        <p className="text-ui text-text-muted">
          Prepared by {advisor} for {view.preparedFor}
        </p>
      ) : null}
    </footer>
  );
}

export function TravelerView({ view, embedded }: { view: SharedTripView; embedded: boolean }) {
  const levels: Levels = embedded
    ? { title: "h2", day: "h3", slot: "h4" }
    : { title: "h1", day: "h2", slot: "h3" };
  const groups = groupDays(travelerDays(view));

  return (
    <div className={cn("bg-surface text-ink", !embedded && "min-h-dvh")}>
      {embedded ? null : <ShareBar view={view} />}
      <div className={embedded ? "w-full" : "mx-auto max-w-[1440px]"}>
        <Hero view={view} level={levels.title} />
        {groups.length === 0 ? (
          <p className={cn("pt-14 text-body-lg text-text-2", GUTTER)}>
            Your days are still being planned. Open this link again soon.
          </p>
        ) : (
          groups.map((group) =>
            group.kind === "planned" ? (
              <PlannedDay key={group.day.day} day={group.day} levels={levels} />
            ) : (
              <FreeDays key={`free-${group.days[0]?.day}`} days={group.days} levels={levels} />
            ),
          )
        )}
        <Footer view={view} />
      </div>
    </div>
  );
}
