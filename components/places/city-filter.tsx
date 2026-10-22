"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FilterPill } from "@/components/ui/filter-pill";

import { placesHref, type PlacesQuery } from "./format";

// The city pills under the page title, bound to ?city=. "All cities" comes
// first; the rest are the advisor's cities, most places first. The pressed
// pill flips at once while the page re-reads behind it.
export function CityFilter({
  cities,
  total,
  query,
}: {
  cities: { city: string; count: number }[];
  total: number;
  query: Required<PlacesQuery>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const active = pending && chosen !== null ? chosen : (query.city ?? "");

  function choose(city: string) {
    setChosen(city);
    startTransition(() => {
      router.replace(placesHref({ ...query, city }), { scroll: false });
    });
  }

  return (
    <div role="group" aria-label="Filter by city" className="flex flex-wrap items-center justify-end gap-2">
      <FilterPill label="All cities" count={total} active={active === ""} onClick={() => choose("")} />
      {cities.map(({ city, count }) => (
        <FilterPill
          key={city}
          label={city}
          count={count}
          active={active.toLowerCase() === city.toLowerCase()}
          onClick={() => choose(city)}
        />
      ))}
    </div>
  );
}
