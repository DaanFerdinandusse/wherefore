import { STAGE_COLUMNS } from "./columns";

// The Trips page while the trips load: the header block and three quiet
// cards per column, the same sizes as the real ones so nothing jumps.
export function TripsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading trips">
      <div className="flex flex-col gap-1.5 px-7 pt-1 pb-[22px]">
        <div className="h-[54px] w-[420px] max-w-full rounded-row bg-avatar/70" />
        <div className="h-[22px] w-[300px] max-w-full rounded-row bg-avatar/50" />
      </div>
      <div className="grid grid-cols-4 gap-4 px-7">
        {STAGE_COLUMNS.map((column) => (
          <div key={column.stage} className="flex min-w-0 flex-col gap-3">
            <p className="flex items-center gap-2 px-1">
              <span aria-hidden className={`size-2 rounded-pill ${column.dotClass}`} />
              <span className="text-body leading-5 font-semibold text-ink">{column.label}</span>
            </p>
            {[0, 1].map((i) => (
              <div key={i} className="flex h-[254px] flex-col overflow-clip rounded-[22px] bg-surface/70">
                <div className="h-[132px] bg-avatar/60" />
                <div className="flex flex-col gap-3 px-4 pt-4">
                  <div className="h-4 w-1/2 rounded-pill bg-avatar/60" />
                  <div className="h-6 w-2/3 rounded-pill bg-avatar/60" />
                  <div className="h-3 w-full rounded-pill bg-avatar/40" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
