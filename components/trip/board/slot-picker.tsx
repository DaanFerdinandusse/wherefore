"use client";

import type { ItinerarySlot, SlotName } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { dayLabel, SLOT_LABELS } from "../workspace/format";
import { SLOT_ORDER, slotAt } from "../workspace/reducer";

// The panel the + opens when no suitable slot is free: every day with its six
// slots. A filled slot shows what is there and can be replaced.
export function SlotPicker({
  days,
  dates,
  slots,
  placeNames,
  onPick,
}: {
  days: number;
  dates: (string | undefined)[];
  slots: ItinerarySlot[];
  placeNames: Record<string, string>;
  onPick: (day: number, slot: SlotName) => void;
}) {
  return (
    <div className="flex max-h-[360px] flex-col gap-3 overflow-y-auto p-1">
      <p className="label-caps px-1 text-text-2">Every matching slot is taken. Pick one</p>
      {Array.from({ length: days }, (_, i) => i + 1).map((day) => (
        <div key={day} className="flex flex-col gap-1.5">
          <p className="label-caps px-1 text-ink">{dayLabel(day, dates[day - 1])}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {SLOT_ORDER.map((slot) => {
              const filled = slotAt(slots, day, slot)?.tripPlaceId;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onPick(day, slot)}
                  title={filled ? `Replace ${placeNames[filled] ?? "the place"} in ${SLOT_LABELS[slot]}` : `Add to ${SLOT_LABELS[slot]}`}
                  className={cn(
                    "flex flex-col items-start rounded-row px-2.5 py-1.5 text-left text-ui-sm transition-colors",
                    filled ? "bg-avatar text-text-2 hover:bg-rule-strong" : "border border-dashed border-pill-outline text-ink hover:bg-ink/5",
                  )}
                >
                  <span className="font-semibold">{SLOT_LABELS[slot]}</span>
                  <span className="w-full truncate text-meta">{filled ? (placeNames[filled] ?? "Taken") : "Free"}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
