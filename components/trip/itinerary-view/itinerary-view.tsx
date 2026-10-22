"use client";

import { useState, type DragEvent, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilmImage } from "@/components/ui/film-image";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import type { ItinerarySlot, SlotName, TripPlaceCard } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { useTripStore } from "../store";
import { carriesPlace, carriesSlot, draggedPlace, draggedSlot, startSlotDrag } from "../workspace/dnd";
import { becauseLine, firstName, shortDate, SLOT_LABELS } from "../workspace/format";
import { categoryForSlot, dateOfDay, dayCount, neighborSlot, SLOT_ORDER, slotKey, slotRows, type SlotRef } from "../workspace/reducer";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

// 04 Itinerary: one column per day with a card per slot (photo, slot, name,
// the reason line) and a note under it. A slot can hold more than one place
// (positions); every one shows. Drag a card onto another slot of the same day
// to reorder, or use its move up and move down buttons (Alt+Arrow): the two
// slots swap place, note and traveler flag. An empty slot's "Add" opens the
// board on the category that fills it.

function useSlotDrop(target: SlotRef, actions: WorkspaceActions) {
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
          if (from.day === target.day) void actions.moveWithinDay(from, target);
          return;
        }
        const tripPlaceId = draggedPlace(e);
        if (tripPlaceId) {
          e.preventDefault();
          void actions.addToSlot(tripPlaceId, target.day, target.slot, target.position ?? 0);
        }
      },
    },
  };
}

const TRAVELER_SWITCH = "Show this note to the traveler";

function NoteField({ slot, actions }: { slot: ItinerarySlot; actions: WorkspaceActions }) {
  const [value, setValue] = useState(slot.note);
  const [prev, setPrev] = useState(slot.note);
  if (prev !== slot.note) {
    setPrev(slot.note);
    setValue(slot.note);
  }
  const forTraveler = slot.noteForTraveler ?? false;
  const ref = { day: slot.day, slot: slot.slot, position: slot.position };
  const save = (note: string, traveler: boolean) => void actions.saveNote(ref, note, traveler);
  const where = `day ${slot.day} ${SLOT_LABELS[slot.slot].toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <label className="block">
        <span className="sr-only">Note for {where}</span>
        <textarea
          value={value}
          rows={1}
          placeholder="Add a note"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save(value.trim(), forTraveler)}
          className="field-sizing-content w-full resize-none border-b border-transparent bg-transparent py-1 text-ui-sm text-text-3 placeholder:text-text-muted hover:border-rule-strong focus:border-glow focus:outline-none"
        />
      </label>
      {value.trim() || forTraveler ? (
        <label className="flex items-center gap-2.5 text-ui-sm text-text-2">
          <Switch
            checked={forTraveler}
            label={`${TRAVELER_SWITCH}, ${where}`}
            onCheckedChange={(next) => save(value.trim(), next)}
          />
          <span aria-hidden>{TRAVELER_SWITCH}</span>
        </label>
      ) : null}
    </div>
  );
}

/** After a move the card renders in another slot: focus follows it there. */
function focusSlotCard(key: string, control: "up" | "down") {
  const run = () => {
    const card = document.querySelector<HTMLElement>(`[data-slot-key="${key}"]`);
    if (!card) return;
    const button = card.querySelector<HTMLButtonElement>(`[data-move="${control}"]:not(:disabled)`);
    (button ?? card.querySelector<HTMLElement>("[data-open]"))?.focus();
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(run));
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
  const ref = { day: slot.day, slot: slot.slot, position: slot.position };
  const drop = useSlotDrop(ref, actions);
  const reason = card.reason ?? becauseLine(card.because, clientName);
  const label = SLOT_LABELS[slot.slot].toLowerCase();

  const move = (direction: -1 | 1) => {
    const to = neighborSlot(slot.slot, direction);
    if (!to) return;
    const target = { day: slot.day, slot: to, position: 0 };
    void actions.moveWithinDay(ref, target);
    focusSlotCard(slotKey(target), direction === -1 ? "up" : "down");
  };
  const up = neighborSlot(slot.slot, -1);
  const down = neighborSlot(slot.slot, 1);

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    if (e.target instanceof HTMLTextAreaElement) return; // the note keeps its own keys
    e.preventDefault();
    move(e.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <li
      {...drop.handlers}
      data-slot-key={slotKey(slot)}
      draggable
      onDragStart={(e) => startSlotDrag(e, ref)}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHighlight(card.tripPlaceId)}
      onMouseLeave={() => setHighlight(null)}
      className={cn("group/slot flex cursor-grab flex-col gap-2 rounded-[18px] active:cursor-grabbing", drop.over && "glow-ring")}
    >
      <div className={cn("relative h-[118px] overflow-hidden rounded-[18px] bg-avatar", (highlighted || justAdded) && "glow-ring")}>
        {card.imageUrl ? <FilmImage src={card.imageUrl} alt="" sizes="300px" /> : null}
        <button
          type="button"
          data-open
          onClick={() => select(card.tripPlaceId)}
          aria-label={`Open ${card.name}`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          className="absolute inset-0 rounded-[18px]"
        />
        <span className="pointer-events-none absolute top-2.5 left-2.5 rounded-pill border border-white/25 bg-ink/42 px-2.5 py-1 text-meta font-semibold text-white backdrop-blur-[12px]">
          {SLOT_LABELS[slot.slot]}
        </span>
        <IconButton
          label={`Clear ${label} on day ${slot.day}`}
          icon={<X size={14} strokeWidth={2} />}
          variant="glass"
          size={32}
          onClick={() => void actions.clearSlotAt(slot.day, slot.slot, slot.position)}
          className="absolute top-2 right-2 opacity-0 group-focus-within/slot:opacity-100 group-hover/slot:opacity-100 focus-visible:opacity-100"
        />
        <div className="absolute right-2 bottom-2 flex gap-1.5 opacity-0 group-focus-within/slot:opacity-100 group-hover/slot:opacity-100">
          <IconButton
            data-move="up"
            label={up ? `Move ${card.name} to ${SLOT_LABELS[up].toLowerCase()}` : `${card.name} is in the first slot`}
            icon={<ChevronUp size={14} strokeWidth={2} />}
            variant="glass"
            size={32}
            disabled={!up}
            onClick={() => move(-1)}
          />
          <IconButton
            data-move="down"
            label={down ? `Move ${card.name} to ${SLOT_LABELS[down].toLowerCase()}` : `${card.name} is in the last slot`}
            icon={<ChevronDown size={14} strokeWidth={2} />}
            variant="glass"
            size={32}
            disabled={!down}
            onClick={() => move(1)}
          />
        </div>
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
  const drop = useSlotDrop({ day, slot, position: 0 }, actions);
  return (
    <li
      {...drop.handlers}
      data-slot-key={slotKey({ day, slot, position: 0 })}
      className={cn(
        "flex items-center justify-between gap-3 rounded-[18px] border-[1.5px] border-dashed px-4 py-3 transition-colors",
        drop.over ? "border-ink bg-ink/5" : "border-rule-strong",
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span className="label-caps text-text-muted">{SLOT_LABELS[slot]}</span>
        <span className="text-ui-sm text-text-muted">{drop.over ? "Drop to add" : "Drag a place here"}</span>
      </span>
      <Button
        variant="outline"
        size="sm"
        data-open
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
  const requestedDays = useTripStore((s) => s.requestedDays);
  const addDay = useTripStore((s) => s.addDay);

  const days = dayCount({ trip, slots, requestedDays });
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
                {SLOT_ORDER.flatMap((name) => {
                  const filled = slotRows(daySlots, day, name).flatMap((slot) => {
                    const card = slot.tripPlaceId ? places[slot.tripPlaceId] : undefined;
                    return card ? [{ slot, card }] : [];
                  });
                  if (filled.length === 0) return [<EmptySlot key={name} day={day} slot={name} actions={actions} />];
                  return filled.map(({ slot, card }) => (
                    <SlotCard
                      key={`${name}|${slot.position}`}
                      slot={slot}
                      card={card}
                      clientName={trip.clientName}
                      justAdded={newest?.id === slot.id}
                      actions={actions}
                    />
                  ));
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
