import { BookmarkMark } from "@/components/ui/bookmark-mark";

import type { PlacesQuery } from "./format";
import { BlendSwitch, ListToggle, TastePanel } from "./rail-controls";

// The right rail of My places: whose list (Mine / Team), the advisor's taste
// tags, the blend toggle with what it does, and how to save from elsewhere.
export function PlacesRail({
  query,
  mineCount,
  teamEnabled,
  placeCount,
  blendMyTaste,
}: {
  query: Required<PlacesQuery>;
  mineCount: number | null;
  teamEnabled: boolean;
  placeCount: number;
  blendMyTaste: boolean;
}) {
  return (
    <aside aria-label="Your taste and settings" className="flex w-86 shrink-0 flex-col gap-7 border-l border-ink/28 pl-8">
      <ListToggle query={query} mineCount={mineCount} teamEnabled={teamEnabled} />

      <TastePanel placeCount={placeCount} />

      <section className="flex flex-col gap-2.5 border-t border-rule pt-6">
        <BlendSwitch initial={blendMyTaste} />
        <p className="text-ui leading-5 text-text-2">
          Your places become extra signals next to the client{"'"}s favorites. Cards then say which of yours
          helped, like {"“"}you love Rosetta{"”"}.
        </p>
        <p className="text-ui-sm text-text-muted">
          Off by default. We are still testing how much weight your places should get.
        </p>
      </section>

      <section className="flex flex-col gap-2.5 border-t border-rule pt-6">
        <div className="flex items-center gap-2.5">
          <BookmarkMark size={28} />
          <h2 className="text-body-lg leading-5 font-semibold text-ink">Save from anywhere</h2>
        </div>
        <p className="text-ui leading-5 text-text-2">
          Turn on {"“"}In my places{"”"} on any place profile to save it here. Or tell the agent: {"“"}save
          Contramar to my places, note: book the 1:30 sitting{"”"}.
        </p>
      </section>
    </aside>
  );
}
