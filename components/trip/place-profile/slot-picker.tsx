"use client";

import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import type { Category, ItinerarySlot } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { isAgentNote } from "../agent-note";
import { SLOT_LABELS, isSlotTaken, pickerSlots, slotChoiceLabel, type SlotChoice, type TripDay } from "./profile-format";

// "Day 2 · Lunch": the slot the place will be added to. Opens upward (it sits
// at the bottom of the sheet) with one row per day and a pill per slot. A
// taken meal says so, and picking it replaces what is there. Morning,
// Afternoon and Night are never taken: the place joins what is in them.

export function SlotPicker({
  value,
  onChange,
  days,
  slots,
  category,
  tripPlaceId,
}: {
  value: SlotChoice;
  onChange: (choice: SlotChoice) => void;
  days: TripDay[];
  slots: ItinerarySlot[];
  category: Category;
  tripPlaceId: string;
}) {
  const [open, setOpen] = useState(false);
  const offered = pickerSlots(category);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Choose a day and a slot"
      panelClassName="top-auto! bottom-full mt-0! mb-2 w-[400px] max-h-[420px] overflow-y-auto"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={buttonClasses({ variant: "soft", size: "lg", className: "gap-2.5 px-[18px]" })}
        >
          <Calendar size={16} strokeWidth={2} aria-hidden />
          {slotChoiceLabel(value)}
          <ChevronDown size={14} strokeWidth={2} aria-hidden className="text-text-muted" />
        </button>
      )}
    >
      <ul className="flex flex-col gap-3">
        {days.map((day) => (
          <li key={day.day} className="flex flex-col gap-2">
            <p className="label-caps px-1 text-text-2">{day.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {offered.map((slot) => {
                const choice = { day: day.day, slot };
                const selected = value.day === day.day && value.slot === slot;
                const here = slots.some((s) => s.day === day.day && s.slot === slot && s.tripPlaceId === tripPlaceId);
                const taken = isSlotTaken(choice, slots) && !here;
                const agentNote = slots.find((s) => s.day === day.day && s.slot === slot && isAgentNote(s));
                return (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      onChange(choice);
                      setOpen(false);
                    }}
                    className={cn(
                      "inline-flex h-[31px] items-center gap-1.5 rounded-pill border px-3 text-ui-sm font-medium transition-colors",
                      selected ? "border-ink bg-ink text-surface" : "border-nav-pill text-ink hover:border-ink hover:bg-ink/5",
                      taken && !selected && "border-dashed text-text-2",
                    )}
                  >
                    {SLOT_LABELS[slot]}
                    {here ? <span className={selected ? "text-surface/70" : "text-text-2"}>· here now</span> : null}
                    {taken ? <span className={selected ? "text-surface/70" : "text-text-2"}>· taken</span> : null}
                    {agentNote ? (
                      <span title={agentNote.note} className={selected ? "text-surface/70" : "text-text-2"}>
                        · Agent note
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
