"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MapPin } from "lucide-react";

import { BookmarkGlyph } from "@/components/ui/bookmark-mark";
import { Spinner } from "@/components/ui/spinner";
import { UnderlineField } from "@/components/ui/underline-field";
import type { Destination } from "@/lib/contracts";
import type { PastDestination } from "@/lib/trips/contracts";
import { cn } from "@/lib/ui/cn";

import { RowIcon } from "./bar-segment";
import { citySuggestionDescription, pastDestinationDescription } from "./format";
import {
  cityKey,
  orderLocalityCandidates,
  placesInCity,
  toDestination,
  type AdvisorCity,
  type LocalityCandidate,
} from "./localities";
import { firstName } from "@/components/trips/format";
import { useDebouncedValue } from "./use-debounced-value";

// Where (F2, D): destinations as you type, each with its disambiguation line
// and how many of the advisor's places are saved there. Every candidate is
// listed (the first one can be a state), so the advisor picks. With an empty
// field: the advisor's top cities and where the client went before.
type SearchState =
  | { status: "idle" }
  | { status: "done"; q: string; candidates: LocalityCandidate[] }
  | { status: "error"; q: string };

export function WhereMenu({
  query,
  onQueryChange,
  cities,
  pastDestinations,
  clientName,
  selected,
  onSelect,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  cities: AdvisorCity[];
  pastDestinations: PastDestination[];
  clientName: string | null;
  selected: Destination | null;
  onSelect: (destination: Destination) => void;
}) {
  const q = query.trim();
  const debounced = useDebouncedValue(q, 300);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });

  useEffect(() => {
    if (debounced.length < 2) return;
    const controller = new AbortController();
    fetch(`/api/localities/search?q=${encodeURIComponent(debounced)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { candidates?: LocalityCandidate[] };
        setSearch({ status: "done", q: debounced, candidates: orderLocalityCandidates(body.candidates ?? []) });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Destination search failed", error);
        setSearch({ status: "error", q: debounced });
      });
    return () => controller.abort();
  }, [debounced]);

  const isSelected = (name: string, lat: number, lon: number) =>
    Boolean(selected && selected.name === name && selected.lat === lat && selected.lon === lon);

  let body: ReactNode;
  if (q.length >= 2) {
    const ready = search.status !== "idle" && search.q === q && debounced === q;
    if (!ready) {
      body = (
        <p className="flex items-center gap-2 px-3 py-4 text-ui text-text-2">
          <Spinner size={14} /> Searching destinations
        </p>
      );
    } else if (search.status === "error") {
      body = (
        <p role="alert" className="px-3 py-4 text-ui text-amber">
          Could not search destinations. Check the spelling or try again in a moment.
        </p>
      );
    } else if (search.status === "done" && search.candidates.length === 0) {
      body = <p className="px-3 py-4 text-ui text-text-2">No destination matches “{q}”. Try the city’s own name.</p>;
    } else if (search.status === "done") {
      body = (
        <>
          <GroupLabel>Destinations</GroupLabel>
          {search.candidates.map((candidate) => {
            const count = placesInCity(cities, candidate.name);
            return (
              <Row
                key={candidate.entityId}
                icon={<MapPin size={18} strokeWidth={1.75} />}
                title={candidate.name}
                description={candidate.disambiguation}
                badge={count > 0 ? count : null}
                selected={isSelected(candidate.name, candidate.lat, candidate.lon)}
                onClick={() => onSelect(toDestination(candidate))}
              />
            );
          })}
        </>
      );
    }
  } else {
    const been = new Set(pastDestinations.map((d) => cityKey(d.name)));
    const topCities = cities.slice(0, 3);
    const past = pastDestinations.slice(0, 3);
    body = (
      <>
        {topCities.length > 0 ? (
          <>
            <GroupLabel>Where you have the most places</GroupLabel>
            {topCities.map((city) => (
              <Row
                key={city.city}
                icon={<BookmarkGlyph size={16} filled={false} />}
                title={city.city}
                description={citySuggestionDescription(city.count, clientName, been.has(cityKey(city.city)))}
                onClick={() => onQueryChange(city.city)}
              />
            ))}
          </>
        ) : null}
        {past.length > 0 && clientName ? (
          <>
            {topCities.length > 0 ? <hr className="my-2 border-0 border-t border-rule" /> : null}
            <GroupLabel>{firstName(clientName)} went before</GroupLabel>
            {past.map((destination) => {
              const { lastTripId, lastStartDate, tripCount, ...stored } = destination;
              return (
                <Row
                  key={lastTripId}
                  icon={<MapPin size={18} strokeWidth={1.75} />}
                  title={destination.name}
                  description={pastDestinationDescription(lastStartDate, tripCount)}
                  selected={isSelected(destination.name, destination.lat, destination.lon)}
                  onClick={() => onSelect(stored)}
                />
              );
            })}
          </>
        ) : null}
        {topCities.length === 0 && (past.length === 0 || !clientName) ? (
          <p className="px-3 py-3 text-ui text-text-2">Type a city, like Lisbon or Mexico City.</p>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <UnderlineField
        value={query}
        onValueChange={onQueryChange}
        label="Search destinations"
        placeholder="Search destinations"
        className="mx-3 mb-3"
      />
      <div className="-mx-3 flex max-h-[min(440px,calc(100dvh-340px))] flex-col gap-0.5 overflow-y-auto px-3">{body}</div>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="label-caps px-3 pt-1 pb-2.5 leading-[14px] text-text-2">{children}</p>;
}

function Row({
  icon,
  title,
  description,
  badge = null,
  selected = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  badge?: number | null;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected || undefined}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-row px-3 py-2.5 text-left transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:-outline-offset-2",
        selected && "bg-canvas",
      )}
    >
      <RowIcon shape="square">{icon}</RowIcon>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-lg leading-5 font-semibold text-ink">{title}</span>
        {description ? <span className="truncate text-ui-sm text-text-2">{description}</span> : null}
      </span>
      {badge !== null ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-pill-outline px-2.5 py-1 text-meta leading-[14px] font-semibold text-ink">
          <BookmarkGlyph size={10} />
          {badge} of your places
        </span>
      ) : null}
    </button>
  );
}
