"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { ChevronDown, GripVertical, Plus, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { BookmarkMark } from "@/components/ui/bookmark-mark";
import { Button } from "@/components/ui/button";
import { FilmImage } from "@/components/ui/film-image";
import { IconButton } from "@/components/ui/icon-button";
import { Pill } from "@/components/ui/pill";
import type { ItinerarySlot, SlotName, TripPlaceCard, TripSnapshot } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { useTripStore } from "../store";
import { carriesPlace, draggedPlace, TRIP_PLACE_TYPE } from "../workspace/dnd";
import { CATEGORY_LABELS, dayLabel, firstName, SLOT_LABELS } from "../workspace/format";
import { categoryForSlot, dateOfDay, dayCount, filledSlotCount, SLOT_ORDER, slotAt } from "../workspace/reducer";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

// 02 right rail: the itinerary by day. Filled slots show the place; empty
// slots are dashed drop targets ("Afternoon · Drop a place here"). Days with
// nothing in them fold to one line, except the next day to plan; every day
// opens while a card is being dragged. Below the days: "Built from".

/** True while a board card is being dragged anywhere on the page. */
function usePlaceDragging(): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const start = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types.includes(TRIP_PLACE_TYPE)) setDragging(true);
    };
    const stop = () => setDragging(false);
    window.addEventListener("dragstart", start);
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragstart", start);
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
  return dragging;
}

function useDropTarget(onPlace: (tripPlaceId: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!carriesPlace(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const id = draggedPlace(e);
        if (!id) return;
        e.preventDefault();
        onPlace(id);
      },
    },
  };
}

function FilledSlotRow({
  slot,
  card,
  onOpen,
  onClear,
  onDropPlace,
}: {
  slot: ItinerarySlot;
  card: TripPlaceCard;
  onOpen: () => void;
  onClear: () => void;
  onDropPlace: (tripPlaceId: string) => void;
}) {
  const { over, handlers } = useDropTarget(onDropPlace);
  return (
    <li {...handlers} className={cn("group/row flex items-center gap-3 rounded-row transition-shadow", over && "glow-ring")}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-row text-left">
        <span className="relative size-[52px] shrink-0 overflow-hidden rounded-row bg-avatar">
          {card.imageUrl ? <FilmImage src={card.imageUrl} alt="" sizes="52px" /> : null}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body leading-5 font-semibold text-ink">{card.name}</span>
          <span className="truncate text-ui-sm leading-[18px] text-text-muted">
            {SLOT_LABELS[slot.slot]} · {CATEGORY_LABELS[card.category]}
          </span>
        </span>
      </button>
      <IconButton
        label={`Clear ${SLOT_LABELS[slot.slot].toLowerCase()} on day ${slot.day}`}
        icon={<X size={14} strokeWidth={2} />}
        variant="ghost"
        size={32}
        onClick={onClear}
        className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
      />
      <GripVertical size={16} strokeWidth={2} aria-hidden className="shrink-0 text-pill-outline" />
    </li>
  );
}

function EmptySlotRow({
  slot,
  onDropPlace,
  onFind,
}: {
  slot: SlotName;
  onDropPlace: (tripPlaceId: string) => void;
  onFind: () => void;
}) {
  const { over, handlers } = useDropTarget(onDropPlace);
  return (
    <li {...handlers}>
      <button
        type="button"
        onClick={onFind}
        title={`Show places for ${SLOT_LABELS[slot].toLowerCase()}`}
        className={cn(
          "flex w-full items-center gap-3 rounded-row border border-dashed px-3.5 py-2.5 text-left transition-colors",
          over ? "border-ink bg-ink/5" : "border-pill-outline hover:border-ink",
        )}
      >
        <span className="w-[86px] shrink-0 text-ui font-semibold text-ink">{SLOT_LABELS[slot]}</span>
        <span className="text-ui-sm text-text-muted">{over ? "Drop to add" : "Drop a place here"}</span>
      </button>
    </li>
  );
}

function DayBlock({
  day,
  date,
  slots,
  places,
  expanded,
  sideLabel,
  onToggle,
  actions,
}: {
  day: number;
  date?: string;
  slots: ItinerarySlot[];
  places: Record<string, TripPlaceCard>;
  expanded: boolean;
  sideLabel: string;
  onToggle: () => void;
  actions: WorkspaceActions;
}) {
  const select = useTripStore((s) => s.select);
  const setView = useTripStore((s) => s.setView);
  const setTab = useTripStore((s) => s.setTab);

  // A drop on a folded day goes to its first free slot that suits the place.
  const header = useDropTarget((tripPlaceId) => {
    const card = places[tripPlaceId];
    const order: SlotName[] = SLOT_ORDER.filter((s) => card && categoryForSlot(s) === card.category);
    const free = [...order, ...SLOT_ORDER].find((s) => !slotAt(slots, day, s)?.tripPlaceId);
    if (free) void actions.addToSlot(tripPlaceId, day, free);
  });

  return (
    <div className="flex flex-col gap-2.5">
      <div {...header.handlers} className={cn("rounded-row", header.over && "glow-ring")}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-3 rounded-row py-0.5 text-left"
        >
          <span className="label-caps leading-4 text-ink">{dayLabel(day, date)}</span>
          <span className="flex items-center gap-1.5 text-ui-sm text-text-muted">
            {sideLabel}
            <ChevronDown size={14} strokeWidth={2} aria-hidden className={cn("transition-transform", expanded && "rotate-180")} />
          </span>
        </button>
      </div>
      {expanded ? (
        <ul className="flex flex-col gap-2.5">
          {SLOT_ORDER.map((name) => {
            const slot = slotAt(slots, day, name);
            const card = slot?.tripPlaceId ? places[slot.tripPlaceId] : undefined;
            const drop = (tripPlaceId: string) => void actions.addToSlot(tripPlaceId, day, name);
            if (slot && card) {
              return (
                <FilledSlotRow
                  key={name}
                  slot={slot}
                  card={card}
                  onOpen={() => select(card.tripPlaceId)}
                  onClear={() => void actions.clearSlotAt(day, name)}
                  onDropPlace={drop}
                />
              );
            }
            return (
              <EmptySlotRow
                key={name}
                slot={name}
                onDropPlace={drop}
                onFind={() => {
                  setView("board");
                  setTab(categoryForSlot(name));
                }}
              />
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function BuiltFromBox({ trip }: { trip: TripSnapshot["trip"] }) {
  const builtFrom = trip.builtFrom;
  if (!builtFrom) return null;
  return (
    <section aria-label="Built from" className="flex flex-col gap-3 rounded-row border border-rule-strong p-4">
      <p className="label-caps text-text-2">Built from</p>
      {builtFrom.favorites.map((f) => (
        <p key={f.clientName} className="flex items-center gap-2.5 text-ui text-ink">
          <Avatar name={f.clientName} size={26} />
          {firstName(f.clientName)}&apos;s {f.names.length} {f.names.length === 1 ? "favorite" : "favorites"}
        </p>
      ))}
      {builtFrom.advisorPlaceCount > 0 ? (
        <p className="flex items-center gap-2.5 text-ui text-ink">
          <BookmarkMark size={26} />
          Your {builtFrom.advisorPlaceCount} {trip.destination.name} {builtFrom.advisorPlaceCount === 1 ? "place" : "places"}
        </p>
      ) : null}
      {builtFrom.companionsWithoutFavorites.map((name) => (
        <p key={name} className="flex items-center gap-2.5 text-ui text-amber">
          <Avatar name={name} size={26} tone="dashed" />
          {firstName(name)}: no favorites yet
        </p>
      ))}
      {builtFrom.rules.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {builtFrom.rules.map((rule) => (
            <Pill key={rule}>{rule}</Pill>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ItineraryRail({ actions }: { actions: WorkspaceActions }) {
  const trip = useTripStore((s) => s.trip);
  const places = useTripStore((s) => s.places);
  const slots = useTripStore((s) => s.slots);
  const extraDays = useTripStore((s) => s.extraDays);
  const addDay = useTripStore((s) => s.addDay);
  const dragging = usePlaceDragging();
  const [toggled, setToggled] = useState<Record<number, boolean>>({});

  const days = dayCount({ trip, slots, extraDays });
  const filled = filledSlotCount(slots);
  const byDay = useMemo(() => {
    const map = new Map<number, ItinerarySlot[]>();
    for (const s of slots) map.set(s.day, [...(map.get(s.day) ?? []), s]);
    return map;
  }, [slots]);
  const dayHasPlace = (day: number) => (byDay.get(day) ?? []).some((s) => s.tripPlaceId && places[s.tripPlaceId]);
  const nextOpenDay = Array.from({ length: days }, (_, i) => i + 1).find((d) => !dayHasPlace(d));

  return (
    <aside aria-label="Itinerary" className="flex flex-col gap-5.5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-wordmark leading-[34px] text-ink">Itinerary</h2>
        <p className="text-ui-sm text-text-muted">
          {filled} of {days * SLOT_ORDER.length} slots filled
        </p>
      </div>
      {Array.from({ length: days }, (_, i) => i + 1).map((day, i) => {
        const daySlots = byDay.get(day) ?? [];
        const hasPlace = dayHasPlace(day);
        const defaultOpen = hasPlace || day === nextOpenDay;
        const expanded = dragging || (toggled[day] ?? defaultOpen);
        const first = daySlots.map((s) => (s.tripPlaceId ? places[s.tripPlaceId] : undefined)).find((c) => c?.neighborhood);
        const sideLabel = first?.neighborhood
          ? first.neighborhood
          : trip.startDate && trip.endDate && day === 1
            ? "Arrival"
            : trip.startDate && trip.endDate && day === days
              ? "Departure"
              : hasPlace
                ? ""
                : "Empty";
        return (
          <div key={day} className="flex flex-col gap-5.5">
            {i > 0 ? <hr className="border-0 border-t border-rule-strong" /> : null}
            <DayBlock
              day={day}
              date={dateOfDay(trip, day)}
              slots={daySlots}
              places={places}
              expanded={expanded}
              sideLabel={sideLabel}
              onToggle={() => setToggled((t) => ({ ...t, [day]: !expanded }))}
              actions={actions}
            />
          </div>
        );
      })}
      {trip.datesMode === "unset" || !trip.endDate ? (
        <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={2} aria-hidden />} onClick={addDay} className="self-start">
          Add a day
        </Button>
      ) : null}
      <BuiltFromBox trip={trip} />
    </aside>
  );
}
