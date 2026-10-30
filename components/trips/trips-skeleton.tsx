import { cn } from "@/lib/ui/cn";

import { STAGE_COLUMNS } from "./columns";

// The Trips page while the trips load: the title block and quiet cards per
// column at the sizes of the real ones, so nothing jumps when they arrive.
export function TripsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading trips" className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-section text-ink">Trips</h1>
        <div className="h-[22px] w-[340px] max-w-full rounded-row bg-avatar/50" />
      </div>
      <div className="grid grid-cols-4 items-start gap-3">
        {STAGE_COLUMNS.map((column, c) => (
          <div key={column.stage} className="flex min-w-0 flex-col gap-2.5">
            <p className="flex items-center gap-2 px-1">
              <span aria-hidden className={cn("size-2 rounded-pill", column.dotClass)} />
              <span className="text-ui leading-[19px] font-semibold text-ink">{column.label}</span>
            </p>
            {column.stage === "done"
              ? [0, 1].map((i) => <div key={i} className="h-[60px] rounded-[16px] bg-surface-raised/60" />)
              : Array.from({ length: c === 0 ? 2 : 1 }, (_, i) => (
                  <div key={i} className="flex flex-col overflow-hidden rounded-[18px] bg-surface-raised/70">
                    <div className="aspect-[3/2] bg-avatar/60" />
                    <div className="flex flex-col gap-2.5 px-3.5 pt-3.5 pb-4">
                      <div className="h-6 w-2/3 rounded-pill bg-avatar/60" />
                      <div className="h-3.5 w-full rounded-pill bg-avatar/40" />
                    </div>
                  </div>
                ))}
          </div>
        ))}
      </div>
    </div>
  );
}
