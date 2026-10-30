"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { CoverCredit } from "@/components/ui/cover-credit";
import type { TravelerFavorite } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { FavoritePlaceSheet, type FavoriteRef } from "../place-profile/favorite-place";
import { useTripStore } from "../store";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

import {
  briefSentence,
  buildDays,
  coverFacts,
  dayNote,
  dayStatus,
  dayTitle,
  firstName,
  findingLabel,
  openDay,
  usesCover,
  type DayView,
  type SlotView,
} from "./itinerary-model";
import { PartGroup } from "./part-group";
import { SlotRow } from "./slot-row";

// The itinerary panel: an overview of the days and what is added to them.
// It opens with the cover: the destination's photo under the title. Before
// two slots hold a place the brief (S1) follows it: one sentence of facts and
// the client's favorites. From two places on the cover carries the facts line
// instead. A trip without a cover photo starts from the title and uses a place
// photo once two are added. Below that, every day is the same
// header with its parts beneath (Morning, Afternoon, Night, each with its meal
// and what else is added); the arrow opens and closes them like an accordion,
// and a day with nothing in it starts closed. A row opens its reasons in
// place; its photo opens the place card.

type PanelProps = { actions: WorkspaceActions };

export function ItineraryPanel({ actions }: PanelProps) {
  const trip = useTripStore((s) => s.trip);
  const travelers = useTripStore((s) => s.travelers);
  const places = useTripStore((s) => s.places);
  const asks = useTripStore((s) => s.asks);
  const slots = useTripStore((s) => s.slots);
  const requestedDays = useTripStore((s) => s.requestedDays);
  const selectedPlaceId = useTripStore((s) => s.selectedPlaceId);

  const days = useMemo(
    () => buildDays({ trip, slots, places, asks, requestedDays, selectedPlaceId }),
    [trip, slots, places, asks, requestedDays, selectedPlaceId],
  );
  const favorites = useMemo(() => clientFavorites(travelers), [travelers]);
  const favoriteImages = useMemo(
    () => new Map(favorites.flatMap((f) => (f.entityId && f.imageUrl ? [[f.entityId, f.imageUrl] as const] : []))),
    [favorites],
  );
  const cover = usesCover(days);
  const first = openDay(days);
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  const [openFavorite, setOpenFavorite] = useState<FavoriteRef | null>(null);
  // A day opens on its own while the chat searches for one of its slots or suggests a place for one.
  const busy = (day: DayView) => day.slots.some((s) => s.finding || s.suggestion);
  const isOpen = (day: DayView) => toggled[day.day] ?? (day.filled > 0 || (!cover && day.day === first) || busy(day));
  const toggle = (day: DayView) => setToggled((t) => ({ ...t, [day.day]: !isOpen(day) }));

  const client = firstName(trip.clientName);
  // The first open slot says how to fill one; the others just say Open.
  const firstOpen = days.flatMap((d) => d.slots).find((s) => !s.card && !s.finding && !s.suggestion);

  return (
    <div className="@container mx-auto flex w-full max-w-[1040px] flex-col gap-[22px] px-6 pt-5 pb-10 max-sm:px-4">
      {cover || trip.cover ? <Cover title={`${client} in ${trip.destination.name}`} days={days} facts={cover} /> : null}
      {cover ? null : (
        <section className="flex flex-col gap-2.5 px-1 pt-1.5">
          {trip.cover ? null : (
            <h2 className="font-display text-section text-ink">
              {client} in {trip.destination.name}
            </h2>
          )}
          <p className="text-body-lg leading-[25px] text-text-3">{briefSentence(trip, travelers, days)}</p>
          {favorites.length > 0 ? (
            <>
              <p className="label-caps pt-2 text-text-3">Matched to {client}&rsquo;s favorites</p>
              <ul className="flex flex-wrap gap-2">
                {favorites.map((f) => {
                  const { entityId, name } = f;
                  const chip = "flex items-center gap-[7px] rounded-pill border border-ink/14 py-1 pr-3 pl-1 text-ui-sm leading-[17px] font-medium text-ink";
                  const face = (
                    <>
                      <span className="relative size-6 shrink-0 overflow-hidden rounded-pill bg-avatar">
                        {f.imageUrl ? <FilmImage src={f.imageUrl} alt="" sizes="24px" /> : null}
                      </span>
                      {name}
                    </>
                  );
                  return entityId ? (
                    <li key={entityId}>
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => setOpenFavorite({ entityId, name })}
                        data-testid="favorite-open"
                        className={cn(chip, "cursor-pointer transition-colors hover:border-ink/40")}
                      >
                        {face}
                      </button>
                    </li>
                  ) : (
                    <li key={name} className={chip}>
                      {face}
                    </li>
                  );
                })}
              </ul>
              <FavoritePlaceSheet favorite={openFavorite} client={client} onClose={() => setOpenFavorite(null)} />
            </>
          ) : null}
        </section>
      )}

      <div className="grid items-start gap-x-6 border-b border-ink/8 @[900px]:grid-cols-2">
        {days.map((day) => (
          <Day
            key={day.day}
            day={day}
            total={days.length}
            open={isOpen(day)}
            firstOpen={firstOpen}
            clientName={trip.clientName}
            countryCode={trip.destination.countryCode}
            favoriteImages={favoriteImages}
            actions={actions}
            onToggle={() => toggle(day)}
          />
        ))}
      </div>
    </div>
  );
}

/** The client's favorites, for the chips of the brief and the small photos in a row's reasons. */
function clientFavorites(travelers: { role: string; favorites?: TravelerFavorite[] }[]): TravelerFavorite[] {
  return travelers.find((t) => t.role === "client")?.favorites ?? [];
}

function Cover({ title, days, facts }: { title: string; days: DayView[]; facts: boolean }) {
  const trip = useTripStore((s) => s.trip);
  const travelers = useTripStore((s) => s.travelers);
  const line = coverFacts(trip, travelers, days);
  const placePhoto = days.flatMap((d) => d.slots).find((s) => s.card?.imageUrl)?.card?.imageUrl;
  const photo = trip.cover?.url ?? placePhoto;
  return (
    <section className="relative flex min-h-[150px] shrink-0 flex-col justify-end gap-2 overflow-hidden rounded-card bg-ink px-[22px] py-[18px]">
      {photo ? <FilmImage src={photo} alt={trip.cover?.alt ?? ""} sizes="992px" priority /> : null}
      <span aria-hidden className="absolute inset-0 bg-linear-to-b from-ink/30 to-ink/82" />
      <h2 className="relative font-display text-[40px] leading-[42px] tracking-[-0.01em] text-white">{title}</h2>
      {facts ? (
        <p className="relative flex flex-wrap gap-x-4 gap-y-1.5 text-ui text-white/90">
          {[line.dates, line.travelers, line.stay, line.progress].filter(Boolean).map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </p>
      ) : null}
      {trip.cover ? <CoverCredit cover={trip.cover} className="relative" /> : null}
    </section>
  );
}

type DayProps = {
  day: DayView;
  total: number;
  open: boolean;
  firstOpen?: SlotView;
  clientName: string;
  countryCode?: string;
  favoriteImages: Map<string, string>;
  actions: WorkspaceActions;
  onToggle: () => void;
};

/** A day: its date and where it mostly is, its progress, the arrow, then one row per slot in a white card. */
function Day({ day, total, open, firstOpen, onToggle, ...row }: DayProps) {
  const title = dayTitle(day);
  const finding = day.slots.find((s) => s.finding);
  const slotsId = useId();
  return (
    <section aria-label={`Day ${day.day}`} className="min-w-0 border-t border-ink/8">
      <div className="flex items-center gap-2 py-2.5 pr-2 pl-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4">
          <h3 className="min-w-0 font-display text-[23px] leading-7 tracking-[-0.02em] text-ink">
            {title.lead}
            {title.place ? <span className="italic"> in {title.place}</span> : null}
          </h3>
          <p className={cn("min-w-0 text-ui-sm leading-4", finding ? "text-amber-deep" : "text-text-2")}>
            {dayNote(day.day, total)} · {finding ? findingLabel(finding.slot) : dayStatus(day)}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={slotsId}
          aria-label={`${open ? "Hide" : "Show"} ${title.lead}`}
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-pill text-text-2 transition-colors hover:bg-ink/8 hover:text-ink"
        >
          <ChevronDown
            size={16}
            strokeWidth={2}
            aria-hidden
            className={cn("transition-transform duration-[320ms] ease-in-out motion-reduce:transition-none", open && "rotate-180")}
          />
        </button>
      </div>
      <div
        id={slotsId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-[320ms] ease-in-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="-mx-1 min-h-0 overflow-hidden">
          <div
            className={cn(
              "px-1 pt-px pb-5 transition-[opacity,translate] duration-[320ms] ease-in-out motion-reduce:transition-none",
              open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
            )}
          >
            <div className="flex flex-col divide-y divide-ink/10 overflow-hidden rounded-card bg-surface-raised shadow-[0_1px_3px_rgb(22_19_15/0.06),0_0_0_1px_rgb(22_19_15/0.04)]">
              {day.parts.map((part) => (
                <PartGroup key={part.part} part={part} firstOpen={firstOpen} {...row} />
              ))}
              {day.stay.length > 0 ? (
                <ul className="flex flex-col divide-y divide-ink/7">
                  {day.stay.map((view) => (
                    <SlotRow key={`${view.slot}-${view.position}`} view={view} hint={view === firstOpen} {...row} />
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
