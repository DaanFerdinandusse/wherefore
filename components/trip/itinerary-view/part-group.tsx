"use client";

import type { PartView, SlotView } from "./itinerary-model";
import { usePartDrop } from "./slot-drop";
import { NewRow, SlotRow, type SlotRowProps } from "./slot-row";

// A part of a day: Morning, Afternoon or Night, with its meal and whatever
// else is added to it. The whole part takes a dropped place that is not a meal,
// so a museum can go in next to lunch: while one hovers, a new row opens at the
// end of the part, even when the part has no open row to drop it on.

type Props = Omit<SlotRowProps, "view" | "hint"> & { part: PartView; firstOpen?: SlotView };

export function PartGroup({ part, firstOpen, ...row }: Props) {
  const drop = usePartDrop(part.add, row.actions);
  const where = `Day ${part.add.day} ${part.label.toLowerCase()}`;

  return (
    <section aria-label={where} {...drop.handlers}>
      <div className="flex h-10 items-center justify-between gap-3 pr-2 pl-3 @[440px]:pl-4">
        <h4 className="font-display text-[17px] leading-5 tracking-normal text-ink">{part.label}</h4>
        {drop.refusal ? <p className="text-ui-sm leading-4 font-medium text-amber-deep">{drop.refusal}</p> : null}
      </div>
      <ul className="flex flex-col divide-y divide-ink/7 border-t border-ink/7">
        {part.slots.map((view) => (
          <SlotRow key={`${view.slot}-${view.position}`} view={view} hint={view === firstOpen} {...row} />
        ))}
      </ul>
      <NewRow label={part.label} drop={drop.state} />
    </section>
  );
}
