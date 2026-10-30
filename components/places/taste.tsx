"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Switch } from "@/components/ui/switch";
import { setBlendMyTasteAction } from "@/lib/places/actions";
import { cn } from "@/lib/ui/cn";

import { placesHref, type PlacesQuery } from "./format";
import { usePlaces } from "./places-provider";

const TASTE_TAGS_SHOWN = 10;

type ListValue = "mine" | "team";

/**
 * Mine / Team. Team shares one list across an organization; until the
 * advisor belongs to one it is shown disabled with how to get there.
 */
export function ListToggle({
  query,
  mineCount,
  teamEnabled,
}: {
  query: Required<PlacesQuery>;
  mineCount: number | null;
  teamEnabled: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const value: ListValue = query.list === "team" && teamEnabled ? "team" : "mine";

  return (
    <div className="flex flex-col items-start gap-2">
      <SegmentedToggle<ListValue>
        label="Whose places"
        value={value}
        onValueChange={(next) => {
          if (next === "team" && !teamEnabled) return;
          startTransition(() => router.replace(placesHref({ ...query, list: next }), { scroll: false }));
        }}
        options={[
          { value: "mine", label: mineCount === null ? "Mine" : `Mine ${mineCount}` },
          { value: "team", label: "Team" },
        ]}
        className={cn(
          !teamEnabled &&
            "[&>button:last-child]:cursor-not-allowed [&>button:last-child]:opacity-45 [&>button:last-child]:hover:bg-transparent",
        )}
      />
      {!teamEnabled ? (
        <p className="text-ui-sm text-text-2">Invite your team to share one list.</p>
      ) : null}
    </div>
  );
}

/** "Your taste": tags from the advisor's own places, with Refresh. */
export function TastePanel({ placeCount }: { placeCount: number }) {
  const { taste, refreshTaste } = usePlaces();
  const used = Math.min(placeCount, 20);
  const shown = taste.tags.slice(0, TASTE_TAGS_SHOWN);

  return (
    <section aria-labelledby="your-taste" className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="your-taste" className="font-display text-section text-ink">
          Your taste
        </h2>
        {placeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshTaste}
            loading={taste.refreshing}
            icon={<RefreshCw size={13} strokeWidth={2} aria-hidden />}
            className="-mr-2 px-2!"
          >
            Refresh
          </Button>
        ) : null}
      </div>
      <p className="text-ui leading-5 text-text-2">
        {placeCount === 0
          ? "Save a few places and the tags they share show up here."
          : placeCount > used
            ? `Tags found across your ${used} most recent places.`
            : `Tags found across your ${placeCount} ${placeCount === 1 ? "place" : "places"}.`}
      </p>
      {taste.error ? (
        <p role="alert" className="text-ui-sm text-amber">
          {taste.error}
        </p>
      ) : null}
      {shown.length > 0 ? (
        <ul className={cn("flex flex-wrap gap-2", taste.refreshing && "opacity-60")} aria-label="Your taste tags">
          {shown.map((tag) => (
            <li key={tag.tagId}>
              <Pill>{tag.name}</Pill>
            </li>
          ))}
        </ul>
      ) : placeCount > 0 && !taste.refreshing ? (
        <p className="text-ui-sm text-text-2">No tags yet. Refresh after saving a few more places.</p>
      ) : null}
    </section>
  );
}

/** "Blend my taste into searches", stored on the advisor. Off by default. */
export function BlendSwitch({ initial }: { initial: boolean }) {
  const { notify } = usePlaces();
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function change(next: boolean) {
    setOn(next);
    setSaving(true);
    const result = await setBlendMyTasteAction(next);
    setSaving(false);
    if (!result.ok) {
      setOn(!next);
      notify(result.error);
      return;
    }
    setOn(result.blendMyTaste);
    notify(result.blendMyTaste ? "Your taste now blends into searches" : "Searches use only your client's taste");
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <span aria-hidden className="text-body-lg leading-5 font-semibold text-ink">
        Blend my taste into searches
      </span>
      <Switch checked={on} onCheckedChange={change} disabled={saving} label="Blend my taste into searches" />
    </div>
  );
}
