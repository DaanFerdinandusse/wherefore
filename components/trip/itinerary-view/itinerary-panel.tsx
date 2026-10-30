"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import type { TravelerFavorite, TripPlaceCard } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { useTripStore } from "../store";
import { startPlaceDrag, startSlotDrag } from "../workspace/dnd";
import { SLOT_LABELS } from "../workspace/format";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

import {
  briefSentence,
  buildDays,
  coverFacts,
  dayDate,
  dayNote,
  dayStatus,
  dayTitle,
  firstName,
  findingLabel,
  openDay,
  slotList,
  usesCards,
  type DayView,
  type SlotView,
} from "./itinerary-model";
import { FindingRow, OpenSlotRow, SlotCard, SuggestionStrip } from "./slot-card";
import { useSlotDrop } from "./slot-drop";

// The itinerary panel (T3, S1). Before two slots hold a place it is the
// brief: the title, one sentence of facts, the client's favorites, the open
// day as a list of slots and the other days as rows. From two places on it is
// the itinerary: a cover photo with the facts line, then each day with its
// place cards; days with nothing yet stay rows. Clicking a card opens the
// place in the chat (store.select); every slot takes a dropped place.

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
  const cards = usesCards(days);
  const first = openDay(days);
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  // A day opens on its own while the chat searches for one of its slots or suggests a place for one.
  const busy = (day: DayView) => day.slots.some((s) => s.finding || s.suggestion);
  const isOpen = (day: DayView) => toggled[day.day] ?? ((!cards && day.day === first) || busy(day));
  const toggle = (day: DayView) => setToggled((t) => ({ ...t, [day.day]: !isOpen(day) }));

  const client = firstName(trip.clientName);
  const common = { clientName: trip.clientName, countryCode: trip.destination.countryCode, favoriteImages, actions };

  return (
    <div className="@container mx-auto flex w-full max-w-[1040px] flex-col gap-[22px] px-6 pt-5 pb-10 max-sm:px-4">
      {cards ? (
        <Cover title={`${client} in ${trip.destination.name}`} days={days} />
      ) : (
        <section className="flex flex-col gap-2.5 px-1 pt-1.5">
          <h2 className="font-display text-section text-ink">
            {client} in {trip.destination.name}
          </h2>
          <p className="text-body-lg leading-[25px] text-text-3">{briefSentence(trip, travelers, days)}</p>
          {favorites.length > 0 ? (
            <>
              <p className="label-caps pt-2 text-text-3">Matched to {client}&rsquo;s favorites</p>
              <ul className="flex flex-wrap gap-2">
                {favorites.map((f) => (
                  <li
                    key={f.entityId ?? f.name}
                    className="flex items-center gap-[7px] rounded-pill border border-ink/14 py-1 pr-3 pl-1 text-ui-sm leading-[17px] font-medium text-ink"
                  >
                    <span className="relative size-6 shrink-0 overflow-hidden rounded-pill bg-avatar">
                      {f.imageUrl ? <FilmImage src={f.imageUrl} alt="" sizes="24px" /> : null}
                    </span>
                    {f.name}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      )}

      <div className={cn("flex flex-col", cards ? "gap-6" : "gap-[26px] px-1")}>
        {groupDays(days, cards, isOpen).map((group) =>
          group.kind === "cards" ? (
            <CardDay key={group.day.day} day={group.day} total={days.length} {...common} />
          ) : group.kind === "open" ? (
            <ListDay key={group.day.day} day={group.day} total={days.length} actions={actions} onCollapse={() => toggle(group.day)} />
          ) : (
            <ul key={`rows-${group.days[0].day}`} className="flex flex-col border-t border-ink/8">
              {group.days.map((day) => (
                <DayRow key={day.day} day={day} total={days.length} onOpen={() => toggle(day)} />
              ))}
            </ul>
          ),
        )}
      </div>
    </div>
  );
}

/** The client's favorites, for the chips and the small photos in the Why box. */
function clientFavorites(travelers: { role: string; favorites?: TravelerFavorite[] }[]): TravelerFavorite[] {
  return travelers.find((t) => t.role === "client")?.favorites ?? [];
}

type DayGroup =
  | { kind: "cards"; day: DayView }
  | { kind: "open"; day: DayView }
  | { kind: "rows"; days: DayView[] };

/** Consecutive collapsed days share one ruled list. */
function groupDays(days: DayView[], cards: boolean, isOpen: (day: DayView) => boolean): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const day of days) {
    if (cards && day.filled > 0) groups.push({ kind: "cards", day });
    else if (isOpen(day)) groups.push({ kind: "open", day });
    else {
      const last = groups[groups.length - 1];
      if (last?.kind === "rows") last.days.push(day);
      else groups.push({ kind: "rows", days: [day] });
    }
  }
  return groups;
}

function Cover({ title, days }: { title: string; days: DayView[] }) {
  const trip = useTripStore((s) => s.trip);
  const travelers = useTripStore((s) => s.travelers);
  const facts = coverFacts(trip, travelers, days);
  const photo = days.flatMap((d) => d.slots).find((s) => s.card?.imageUrl)?.card?.imageUrl;
  return (
    <section className="relative flex h-[150px] shrink-0 flex-col justify-end gap-2 overflow-hidden rounded-card bg-ink px-[22px] py-[18px]">
      {photo ? <FilmImage src={photo} alt="" sizes="620px" priority /> : null}
      <span aria-hidden className="absolute inset-0 bg-linear-to-b from-ink/10 to-ink/82" />
      <h2 className="relative font-display text-[40px] leading-[42px] tracking-[-0.01em] text-white">{title}</h2>
      <p className="relative flex flex-wrap gap-x-4 gap-y-1.5 text-ui text-white/90">
        {[facts.dates, facts.travelers, facts.stay, facts.open].filter(Boolean).map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </p>
    </section>
  );
}

type CardDayProps = {
  day: DayView;
  total: number;
  clientName: string;
  countryCode?: string;
  favoriteImages: Map<string, string>;
  actions: WorkspaceActions;
};

type Segment = { kind: "pair"; views: (SlotView & { card: TripPlaceCard })[] } | { kind: "single"; view: SlotView };

function withCard(view: SlotView): view is SlotView & { card: TripPlaceCard } {
  return !!view.card;
}

/** Cards side by side two by two; dinner is the wide card; open slots between them as rows. */
function segments(day: DayView): Segment[] {
  const out: Segment[] = [];
  for (const view of day.slots) {
    const last = out[out.length - 1];
    if (withCard(view) && view.slot !== "dinner") {
      if (last?.kind === "pair" && last.views.length < 2) last.views.push(view);
      else out.push({ kind: "pair", views: [view] });
    } else {
      out.push({ kind: "single", view });
    }
  }
  return out;
}

function CardDay({ day, total, ...card }: CardDayProps) {
  const title = dayTitle(day);
  return (
    <section aria-label={`Day ${day.day}`} className="flex flex-col gap-3.5">
      <header className="flex items-baseline justify-between gap-4 px-0.5">
        <h3 className="font-display text-[28px] leading-8 tracking-normal text-ink">
          {title.lead}
          {title.place ? <span className="italic"> in {title.place}</span> : null}
        </h3>
        <span className="shrink-0 text-ui-sm leading-4 text-text-2">
          Day {day.day} of {total}
        </span>
      </header>
      {segments(day).map((segment) =>
        segment.kind === "pair" ? (
          <div key={segment.views[0].slot} className="grid items-start gap-3 @[540px]:grid-cols-2">
            {segment.views.map((view) => (
              <SlotCard key={view.slot} view={view} {...card} />
            ))}
          </div>
        ) : withCard(segment.view) ? (
          <div key={segment.view.slot} className="pt-1.5">
            <SlotCard view={segment.view} feature {...card} />
          </div>
        ) : segment.view.finding ? (
          <FindingRow key={segment.view.slot} view={segment.view} />
        ) : segment.view.suggestion ? (
          <SuggestionStrip key={segment.view.slot} view={{ ...segment.view, suggestion: segment.view.suggestion }} actions={card.actions} />
        ) : (
          <OpenSlotRow key={segment.view.slot} view={segment.view} actions={card.actions} />
        ),
      )}
    </section>
  );
}

/** A day before it has cards (S1): the date, then each slot as a row of a white card. */
function ListDay({
  day,
  total,
  actions,
  onCollapse,
}: {
  day: DayView;
  total: number;
  actions: WorkspaceActions;
  onCollapse: () => void;
}) {
  return (
    <section aria-label={`Day ${day.day}`} className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-[23px] leading-7 tracking-[-0.02em] text-ink">
          <button type="button" onClick={onCollapse} aria-expanded className="text-left hover:underline">
            {day.date ? dayDate(day.date) : `Day ${day.day}`}
          </button>
        </h3>
        <span className="shrink-0 text-ui-sm leading-4 text-text-2">{dayNote(day.day, total)}</span>
      </header>
      <ul className="flex flex-col rounded-card bg-surface-raised p-1.5 shadow-[0_1px_3px_rgb(22_19_15/0.06),0_0_0_1px_rgb(22_19_15/0.04)]">
        {day.slots.map((view, i) => (
          <ListSlot key={`${view.slot}-${view.position}`} view={view} first={i === 0} actions={actions} />
        ))}
      </ul>
    </section>
  );
}

function ListSlot({ view, first, actions }: { view: SlotView; first: boolean; actions: WorkspaceActions }) {
  const select = useTripStore((s) => s.select);
  const drop = useSlotDrop({ day: view.day, slot: view.slot, position: view.position }, actions);
  const label = SLOT_LABELS[view.slot];
  const place = view.card ?? view.suggestion;

  if (view.finding) {
    return (
      <li className={cn(!first && "border-t border-ink/7")} {...drop.handlers}>
        <FindingRow view={view} compact />
      </li>
    );
  }

  return (
    <li
      {...drop.handlers}
      className={cn(
        "flex items-center gap-4 rounded-row py-2 pr-2.5 pl-3.5 transition-colors",
        !first && "rounded-t-none border-t border-ink/7",
        drop.over && "bg-why/70",
      )}
    >
      <span className="label-caps w-[100px] shrink-0 font-semibold tracking-[0.12em] text-text-2">{label}</span>
      <span className="min-w-0 flex-1">
        {view.card ? (
          <button
            type="button"
            onClick={() => select(view.card!.tripPlaceId)}
            className="truncate text-left text-body font-semibold text-ink hover:underline"
          >
            {view.card.name}
          </button>
        ) : view.suggestion ? (
          <button
            type="button"
            onClick={() => select(view.suggestion!.tripPlaceId)}
            className="flex flex-col items-start text-left"
          >
            <span className="text-ui text-ink">{view.suggestion.name} suggested in chat</span>
            <span className="text-meta text-amber-deep">Add it from the card, or drag it here</span>
          </button>
        ) : (
          <span className="text-ui text-text-2">Open</span>
        )}
      </span>
      {place ? (
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            if (view.card) startSlotDrag(e, { day: view.day, slot: view.slot, position: view.position });
            startPlaceDrag(e, place.tripPlaceId);
          }}
          onClick={() => select(place.tripPlaceId)}
          aria-label={`Open ${place.name} in the chat`}
          className={cn(
            "relative h-14 w-[84px] shrink-0 cursor-grab overflow-hidden rounded-[10px] bg-avatar",
            !view.card && "opacity-65 outline-[1.5px] outline-offset-2 outline-amber outline-dashed",
          )}
        >
          {place.imageUrl ? <FilmImage src={place.imageUrl} alt="" sizes="84px" /> : null}
        </button>
      ) : (
        <span aria-hidden className="h-14 w-[84px] shrink-0 rounded-[10px] border-[1.5px] border-dashed border-ink/15" />
      )}
    </li>
  );
}

/** A collapsed day: "Sat 15 May · Day 2 · Morning, lunch, dinner · Open". Opens its slot list. */
function DayRow({ day, onOpen }: { day: DayView; total: number; onOpen: () => void }) {
  const finding = day.slots.find((s) => s.finding);
  return (
    <li className="border-b border-ink/8">
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={false}
        className="group flex h-[52px] w-full items-center gap-4 text-left"
      >
        <span className="w-[150px] shrink-0 font-display text-[20px] leading-6 tracking-[-0.02em] text-ink">
          {day.date ? dayDate(day.date) : `Day ${day.day}`}
        </span>
        <span className="min-w-0 flex-1 truncate text-ui-sm leading-4 text-text-2">
          Day {day.day} · {slotList(day.slots.map((s) => s.slot))}
        </span>
        <span className={cn("flex shrink-0 items-center gap-1.5 text-ui-sm leading-4", finding ? "text-amber-deep" : "text-text-2")}>
          {finding ? findingLabel(finding.slot) : dayStatus(day)}
          <ChevronDown size={14} strokeWidth={2} aria-hidden className="text-text-muted transition-transform group-hover:translate-y-px" />
        </span>
      </button>
    </li>
  );
}
