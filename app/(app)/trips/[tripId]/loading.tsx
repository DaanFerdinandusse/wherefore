import { SkeletonCard } from "@/components/ui/skeleton-card";

// The workspace while the session and the snapshot load: the board's shape
// with placeholder cards, so nothing jumps when the real board arrives.
export default function TripLoading() {
  return (
    <div className="flex h-dvh flex-col bg-canvas" aria-busy="true">
      <div className="h-[76px] shrink-0" />
      <div className="flex min-h-0 flex-1 gap-6 px-7 pt-1">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="h-[54px] w-[420px] max-w-full rounded-row bg-avatar" />
            <span className="h-5 w-[320px] max-w-full rounded-row bg-avatar/70" />
          </div>
          <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
            <SkeletonCard clientName="your client" className="col-span-2 h-[340px]" />
            <SkeletonCard clientName="your client" className="h-[340px]" />
            <SkeletonCard clientName="your client" className="h-[300px]" />
          </div>
        </div>
        <div className="hidden w-[360px] shrink-0 border-l border-rule-strong lg:block" />
      </div>
    </div>
  );
}
