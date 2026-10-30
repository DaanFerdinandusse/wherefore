"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { removePlaceAction, undoRemoveAction } from "@/lib/places/actions";
import type { AdvisorPlaceRow } from "@/lib/places/contracts";

import { placeSections, type CategoryFilter } from "./city";
import { placesHref, type PlacesQuery } from "./format";
import { PlaceCard } from "./place-card";
import { usePlaces } from "./places-provider";

// The city's places in sections (Hotels, Restaurants and bars, ...), four
// cards to a row. On "All" each section previews its first four with an
// "All 6 hotels" link that switches the tab. Remove hides the card at once,
// deletes on the server and offers Undo, which puts the row back with its
// note, saved date and trip links.
export function CityPlaces({
  places,
  filter,
  query,
  now,
}: {
  places: AdvisorPlaceRow[];
  filter: CategoryFilter | null;
  query: PlacesQuery;
  now: string;
}) {
  const { notify, tasteChanged } = usePlaces();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const today = new Date(now);
  const sections = placeSections(
    places.filter((place) => !hidden.has(place.id)),
    filter,
  );

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
  const priorityIds = new Set(sections.flatMap((s) => s.places).slice(0, 4).map((p) => p.id));

  return (
    <>
      {sections.map((section) => (
        <section key={section.key} aria-labelledby={`section-${section.key}`} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h2 id={`section-${section.key}`} className="font-display text-tile tracking-[-0.02em] text-ink">
              {section.title}
            </h2>
            {section.seeAll ? (
              <Link
                href={placesHref({ ...query, category: section.seeAll.filter })}
                scroll={false}
                className="flex items-center gap-1 text-ui font-semibold text-ink underline-offset-4 hover:underline"
              >
                {section.seeAll.label}
                <ChevronRight size={14} strokeWidth={2} aria-hidden />
              </Link>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-4">
            {section.places.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                now={today}
                onRemove={remove}
                priority={priorityIds.has(place.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
