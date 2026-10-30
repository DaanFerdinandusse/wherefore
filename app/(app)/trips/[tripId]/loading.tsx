import { MenuButton } from "@/components/shell/top-nav";

// The workspace while the session and the snapshot load: the v3 frame (the
// menu button and trip pill over the chat column, the trip panel on the
// right) with quiet placeholders, so nothing jumps when the trip arrives.
export default function TripLoading() {
  return (
    <div className="flex h-dvh gap-5 overflow-hidden bg-canvas py-4 pr-4 pl-7 max-xl:pl-4" aria-busy="true">
      <div className="flex min-w-0 basis-[51.5%] flex-col">
        <div className="flex shrink-0 items-center gap-2.5 pt-1">
          <MenuButton />
          {/* The look of `floatingPill` (top-nav), written out: a server file cannot read a client module's constant. */}
          <span className="flex h-11 w-[230px] items-center gap-2.5 rounded-pill bg-surface py-[5px] pr-3.5 pl-[5px] shadow-[0_1px_3px_rgb(22_19_15/0.08)]">
            <span className="size-[34px] shrink-0 rounded-pill bg-avatar" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="h-3 w-32 rounded-pill bg-avatar" />
              <span className="h-2.5 w-20 rounded-pill bg-avatar/70" />
            </span>
          </span>
        </div>
        <div className="mt-auto h-[62px] rounded-[31px] bg-surface/70" />
      </div>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-sheet bg-surface shadow-[0_2px_8px_rgb(22_19_15/0.08),0_0_0_1px_rgb(22_19_15/0.04)]">
        <div className="flex min-h-[71px] items-center justify-between border-b border-ink/8 px-4 py-3.5">
          <span className="h-[42px] w-[200px] rounded-pill bg-canvas" />
          <span className="size-[34px] rounded-pill bg-avatar" />
        </div>
        <div className="min-h-0 flex-1 bg-avatar/40" />
      </section>
    </div>
  );
}
