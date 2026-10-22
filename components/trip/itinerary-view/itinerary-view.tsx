"use client";

import { useState, type DragEvent } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilmImage } from "@/components/ui/film-image";
import { IconButton } from "@/components/ui/icon-button";
import type { ItinerarySlot, SlotName, TripPlaceCard } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { useTripStore } from "../store";
import { carriesPlace, carriesSlot, draggedPlace, draggedSlot, startSlotDrag } from "../workspace/dnd";
import { becauseLine, firstName, shortDate, SLOT_LABELS } from "../workspace/format";
import { categoryForSlot, dateOfDay, dayCount, SLOT_ORDER, slotAt } from "../workspace/reducer";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

// 04 Itinerary: one column per day with a card per slot (photo, slot, name,
// the reason line) and a note under it. Drag a card onto another slot of the
// same day to reorder (the two swap). An empty slot's "Add" opens the board on
// the category that fills it.

function useSlotDrop(day: number, slot: SlotName, actions: WorkspaceActions) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!carriesSlot(e) && !carriesPlace(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const from = draggedSlot(e);
        if (from) {
          e.preventDefault();
          // Reorder is within a day; a drop from another day is ignored.
          if (from.day === day) void actions.moveWithinDay(from, { day, slot });
          return;
        }
        const tripPlaceId = draggedPlace(e);
        if (tripPlaceId) {
          e.preventDefault();
          void actions.addToSlot(tripPlaceId, day, slot);
        }
      },
    },
  };
}

function NoteField({ slot, actions }: { slot: ItinerarySlot; actions: WorkspaceActions }) {
  const [value, setValue] = useState(slot.note);
  const [prev, setPrev] = useState(slot.note);
  if (prev !== slot.note) {
    setPrev(slot.note);
    setValue(slot.note);
  }
  return (
    <label className="block px-1">
      <span className="sr-only">
        Note for day {slot.day} {SLOT_LABELS[slot.slot].toLowerCase()}
      </span>
      <textarea
        value={value}
        rows={1}
        placeholder="Add a note for the traveler"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void actions.saveNote(slot.day, slot.slot, value.trim())}
        className="field-sizing-content w-full resize-none border-b border-transparent bg-transparent py-1 text-ui-sm text-text-3 placeholder:text-text-muted hover:border-rule-strong focus:border-glow focus:outline-none"
      />
    </label>
  );
}

function SlotCard({
  slot,
  card,
  clientName,
  justAdded,
  actions,
}: {
  slot: ItinerarySlot;
  card: TripPlaceCard;
  clientName: string;
  justAdded: boolean;
  actions: WorkspaceActions;
}) {
  const select = useTripStore((s) => s.select);
  const setHighlight = useTripStore((s) => s.setHighlight);
  const highlighted = useTripStore((s) => s.highlightedPlaceId === card.tripPlaceId);
  const drop = useSlotDrop(slot.day, slot.slot, actions);
  const reason = card.reason ?? becauseLine(card.because, clientName);
  return (
    <li
      {...drop.handlers}
      draggable
      onDragStart={(e) => startSlotDrag(e, { day: slot.day, slot: slot.slot })}
      onMouseEnter={() => setHighlight(card.tripPlaceId)}
      onMouseLeave={() => setHighlight(null)}
      className={cn("group/slot flex cursor-grab flex-col gap-2 rounded-[18px] active:cursor-grabbing", drop.over && "glow-ring")}
    >
      <div className={cn("relative h-[118px] overflow-hidden rounded-[18px] bg-avatar", (highlighted || justAdded) && "glow-ring")}>
        {card.imageUrl ? <FilmImage src={card.imageUrl} alt="" sizes="300px" /> : null}
        <button
          type="button"
          onClick={() => select(card.tripPlaceId)}
          aria-label={`Open ${card.name}`}
          className="absolute inset-0 rounded-[18px]"
        />
        <span className="pointer-events-none absolute top-2.5 left-2.5 rounded-pill border border-white/25 bg-ink/42 px-2.5 py-1 text-meta font-semibold text-white backdrop-blur-[12px]">
          {SLOT_LABELS[slot.slot]}
        </span>
        <IconButton
          label={`Clear ${SLOT_LABELS[slot.slot].toLowerCase()} on day ${slot.day}`}
          icon={<X size={14} strokeWidth={2} />}
          variant="glass"
          size={32}
          onClick={() => void actions.clearSlotAt(slot.day, slot.slot)}
          className="absolute top-2 right-2 opacity-0 group-hover/slot:opacity-100 focus-visible:opacity-100"
        />
      </div>
      <div className="flex flex-col px-1">
        <span className="text-body-lg leading-[21px] font-semibold text-ink">{card.name}</span>
        {reason ? <span className="text-ui-sm leading-[18px] text-text-muted">{reason}</span> : null}
      </div>
      <NoteField slot={slot} actions={actions} />
    </li>
  );
}

function EmptySlot({ day, slot, actions }: { day: number; slot: SlotName; actions: WorkspaceActions }) {
  const setView = useTripStore((s) => s.setView);
  const setTab = useTripStore((s) => s.setTab);
  const drop = useSlotDrop(day, slot, actions);
  return (
    <li
      {...drop.handlers}
      className={cn(
        "flex items-center justify-between gap-3 rounded-[18px] border-[1.5px] border-dashed px-4 py-3 transition-colors",
        drop.over ? "border-ink bg-ink/5" : "border-rule-strong",
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span className="label-caps text-text-muted">{SLOT_LABELS[slot]}</span>
        <span className="text-ui-sm text-text-muted">{drop.over ? "Drop to add" : "Drag a place here or ask the agent"}</span>
      </span>
      <Button
        variant="outline"
        size="sm"
        icon={<Plus size={14} strokeWidth={2} aria-hidden />}
        aria-label={`Add a place for day ${day} ${SLOT_LABELS[slot].toLowerCase()}`}
        onClick={() => {
          setView("board");
          setTab(categoryForSlot(slot));
        }}
      >
        Add
      </Button>
    </li>
  );
}

export function ItineraryView({ actions }: { actions: WorkspaceActions }) {
  const trip = useTripStore((s) => s.trip);
  const places = useTripStore((s) => s.places);
  const slots = useTripStore((s) => s.slots);
  const extraDays = useTripStore((s) => s.extraDays);
  const addDay = useTripStore((s) => s.addDay);

  const days = dayCount({ trip, slots, extraDays });
  const placed = new Set(slots.map((s) => s.tripPlaceId).filter((id): id is string => !!id && !!places[id]));
  const client = firstName(trip.clientName);
  const range = trip.startDate && trip.endDate ? `${shortDate(trip.startDate)} to ${shortDate(trip.endDate)}` : "Dates not set";
  const newest = slots.reduce<ItinerarySlot | null>((best, s) => (s.id.startsWith("optimistic:") ? s : best), null);

  return (
    <section aria-label="Itinerary" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-end justify-between px-7 pt-1 pb-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-title text-ink">
            {client} in {trip.destination.name}
          </h1>
          <p className="text-body leading-[22px] text-text-muted">
            {days} {days === 1 ? "day" : "days"} · {placed.size} {placed.size === 1 ? "place" : "places"} · {range}
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-7 pb-[240px]">
        {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
          const date = dateOfDay(trip, day);
          const daySlots = slots.filter((s) => s.day === day);
          const area = daySlots.map((s) => (s.tripPlaceId ? places[s.tripPlaceId]?.neighborhood : undefined)).find(Boolean);
          return (
            <section
              key={day}
              aria-label={`Day ${day}`}
              className="flex h-fit w-[330px] shrink-0 flex-col gap-3.5 rounded-t-sheet bg-surface px-4 py-4.5"
            >
              <div className="flex items-baseline justify-between px-1">
                <h2 className="font-display text-card-sm leading-8 text-ink">{date ? shortDate(date) : `Day ${day}`}</h2>
                <span className="text-ui-sm text-text-muted">{[date ? `Day ${day}` : null, area].filter(Boolean).join(" · ")}</span>
              </div>
              <ul className="flex flex-col gap-3.5">
                {SLOT_ORDER.map((name) => {
                  const slot = slotAt(slots, day, name);
                  const card = slot?.tripPlaceId ? places[slot.tripPlaceId] : undefined;
                  return slot && card ? (
                    <SlotCard
                      key={name}
                      slot={slot}
                      card={card}
                      clientName={trip.clientName}
                      justAdded={newest?.id === slot.id}
                      actions={actions}
                    />
                  ) : (
                    <EmptySlot key={name} day={day} slot={name} actions={actions} />
                  );
                })}
              </ul>
            </section>
          );
        })}
        {trip.datesMode === "unset" || !trip.endDate ? (
          <div className="flex h-[240px] w-[220px] shrink-0 items-center justify-center rounded-t-sheet border-[1.5px] border-dashed border-rule-strong">
            <Button variant="outline" icon={<Plus size={16} strokeWidth={2} aria-hidden />} onClick={addDay}>
              Add a day
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
