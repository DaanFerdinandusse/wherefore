// The client profile while it loads: the header shape and the two columns.
export function ProfileSkeleton() {
  return (
    <div aria-busy className="flex flex-col">
      <div className="flex items-center gap-[22px] px-7 pt-2 pb-7">
        <span className="h-[116px] w-[84px] rounded-pill bg-avatar" />
        <div className="flex flex-col gap-3">
          <span className="h-4 w-32 rounded-pill bg-surface" />
          <span className="h-12 w-80 rounded-pill bg-surface" />
          <span className="h-4 w-64 rounded-pill bg-surface" />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,880fr)_minmax(380px,480fr)] gap-6 px-7">
        <span className="mt-12 h-[300px] rounded-sheet bg-surface/60" />
        <span className="h-[560px] rounded-sheet bg-surface/60" />
      </div>
    </div>
  );
}
