// C2 while the client loads: the header shape, the photo grid and the side
// column, in quiet fills.
export function ProfileSkeleton() {
  return (
    <div aria-busy aria-label="Loading the client" className="flex min-h-0 grow flex-col gap-6 px-10 pt-7">
      <div className="flex items-center gap-[18px] border-b border-ink/8 pb-5">
        <span className="size-16 rounded-pill bg-avatar" />
        <div className="flex flex-col gap-2.5">
          <span className="h-10 w-64 rounded-pill bg-avatar/70" />
          <span className="h-4 w-80 rounded-pill bg-avatar/50" />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,688fr)_minmax(280px,360fr)] gap-8">
        <div className="flex flex-col gap-4">
          <span className="h-9 w-72 rounded-pill bg-avatar/50" />
          <div className="flex gap-3">
            <span className="aspect-square grow-[1] basis-0 rounded-[18px] bg-avatar/60" />
            <span className="aspect-[1.5] grow-[1.5] basis-0 rounded-[18px] bg-avatar/60" />
          </div>
        </div>
        <div className="flex flex-col gap-4 pt-[60px]">
          <span className="h-[220px] rounded-card bg-amber-wash/70" />
          <span className="h-[194px] rounded-2xl bg-avatar/40" />
        </div>
      </div>
    </div>
  );
}
