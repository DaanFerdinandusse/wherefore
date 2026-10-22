"use client";

import { useState } from "react";

import type { AdvisorPlaceRow } from "@/lib/places/contracts";
import { removePlaceAction, undoRemoveAction } from "@/lib/places/actions";

import { groupByCity } from "./format";
import { PlaceCard } from "./place-card";
import { usePlaces } from "./places-provider";

// The saved places as a card grid. With one city (or a city filter) it is one
// grid; across cities each city gets its own labeled section. Remove hides the
// card at once, deletes on the server and offers Undo, which puts the row back
// with its note, saved date and trip links.
export function PlacesGrid({
  places,
  cityOrder,
  grouped,
  now,
}: {
  places: AdvisorPlaceRow[];
  cityOrder: string[];
  grouped: boolean;
  now: string;
}) {
  const { notify, tasteChanged } = usePlaces();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const today = new Date(now);
  const visible = places.filter((place) => !hidden.has(place.id));
  const groups = grouped ? groupByCity(visible, cityOrder) : [{ city: "", places: visible }];

  function setHiddenFor(id: string, hide: boolean) {
    setHidden((current) => {
      const next = new Set(current);
      if (hide) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function remove(place: AdvisorPlaceRow) {
    setHiddenFor(place.id, true);
    const result = await removePlaceAction(place.id);
    if (!result.ok) {
      setHiddenFor(place.id, false);
      notify(result.error);
      return;
    }
    tasteChanged();
    notify(`Removed ${place.name} from your places`, async () => {
      const undone = await undoRemoveAction(result.removed);
      if (!undone.ok) {
        notify(undone.error);
        return;
      }
      setHiddenFor(place.id, false);
      tasteChanged();
      notify(`${place.name} is back in your places`);
    });
  }

  // The first row of photos loads eagerly.
  const priorityIds = new Set(groups.flatMap((group) => group.places).slice(0, 3).map((place) => place.id));
  return (
    <div className="flex flex-col gap-10">
      {groups.map((group) => (
        <section key={group.city || "all"} aria-label={group.city || undefined} className="flex flex-col gap-4">
          {grouped ? (
            <h2 className="label-caps leading-[14px] text-text-2">
              {group.city} · {group.places.length}
            </h2>
          ) : null}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-x-5 gap-y-8">
            {group.places.map((place) => (
              <PlaceCard key={place.id} place={place} now={today} onRemove={remove} priority={priorityIds.has(place.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
