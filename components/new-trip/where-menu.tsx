"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MapPin, Search } from "lucide-react";

import { BookmarkGlyph } from "@/components/ui/bookmark-mark";
import { FilmImage } from "@/components/ui/film-image";
import { Spinner } from "@/components/ui/spinner";
import { firstName } from "@/components/trips/format";
import type { Destination } from "@/lib/contracts";
import type { PastDestination } from "@/lib/trips/contracts";
import { cn } from "@/lib/ui/cn";

import { DropLabel } from "./bar-segment";
import { enterRows, moveBetweenRows } from "./drop-keys";
import { cityCardLine, countryName } from "./format";
import {
  cityKey,
  orderLocalityCandidates,
  placesInCity,
  storedDestination,
  toDestination,
  type AdvisorCity,
  type LocalityCandidate,
} from "./localities";
import { useDebouncedValue } from "./use-debounced-value";

// Where (N2): "Search a city" over the destination search, and before typing
// two rows of city cards: where the advisor has the most places, and where
// the client went before. A card shows a photo of one of the advisor's places
// there, the advisor's place count and whether the client went; a fact that
// is missing is left out. Picking an advisor city searches it (the advisor
// still picks the exact destination); a past destination is picked as stored.
type SearchState =
  | { status: "idle" }
  | { status: "done"; q: string; candidates: LocalityCandidate[] }
  | { status: "error"; q: string };

export function WhereMenu({
  query,
  onQueryChange,
  cities,
  cityImages,
  pastDestinations,
  clientName,
  selected,
  onSelect,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  cities: AdvisorCity[];
  cityImages: { city: string; imageUrl: string }[];
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
  const imageFor = (name: string) => cityImages.find((c) => cityKey(c.city) === cityKey(name))?.imageUrl ?? null;

  let body: ReactNode;
  if (q.length >= 2) {
    const ready = search.status !== "idle" && search.q === q && debounced === q;
    if (!ready) {
      body = (
        <Note>
          <Spinner size={14} /> Searching destinations
        </Note>
      );
    } else if (search.status === "error") {
      body = <Note alert>Could not search destinations. Check the spelling or try again in a moment.</Note>;
    } else if (search.status === "done" && search.candidates.length === 0) {
      body = <Note>No destination matches “{q}”. Try the city’s own name.</Note>;
    } else if (search.status === "done") {
      body = (
        <div className="flex flex-col gap-2.5">
          <DropLabel inset="px-2">Destinations</DropLabel>
          <div onKeyDown={moveBetweenRows} className="grid grid-cols-1 gap-1 min-[900px]:grid-cols-2">
            {search.candidates.map((candidate) => {
              const count = placesInCity(cities, candidate.name);
              return (
                <ResultRow
                  key={candidate.entityId}
                  title={candidate.name}
                  description={candidate.disambiguation}
                  count={count}
                  selected={isSelected(candidate.name, candidate.lat, candidate.lon)}
                  onClick={() => onSelect(toDestination(candidate))}
                />
              );
            })}
          </div>
        </div>
      );
    }
  } else {
    const wentBy = new Map(pastDestinations.map((d) => [cityKey(d.name), d.lastStartDate]));
    const past = clientName ? pastDestinations.slice(0, 2) : [];
    const topCities = cities.slice(0, past.length > 0 ? 2 : 4);
    const both = topCities.length > 0 && past.length > 0;

    body =
      topCities.length === 0 && past.length === 0 ? (
        <Note>Type a city, like Lisbon or Mexico City.</Note>
      ) : (
        <div onKeyDown={moveBetweenRows} className={cn("grid gap-6", both && "grid-cols-2")}>
          {topCities.length > 0 ? (
            <CardSection label="Where you have the most places" columns={both ? 2 : 4}>
              {topCities.map((city) => (
                <CityCard
                  key={city.city}
                  name={city.city}
                  country={null}
                  imageUrl={imageFor(city.city)}
                  line={cityCardLine({ count: city.count, clientName, went: wentBy.get(cityKey(city.city)) })}
                  onClick={() => onQueryChange(city.city)}
                />
              ))}
            </CardSection>
          ) : null}
          {past.length > 0 && clientName ? (
            <CardSection label={`${firstName(clientName)} went before`} columns={both ? 2 : 4}>
              {past.map((destination) => {
                const { lastTripId, lastStartDate } = destination;
                return (
                  <CityCard
                    key={lastTripId}
                    name={destination.name}
                    country={countryName(destination.countryCode)}
                    imageUrl={imageFor(destination.name)}
                    line={cityCardLine({ count: placesInCity(cities, destination.name), clientName, went: lastStartDate })}
                    selected={isSelected(destination.name, destination.lat, destination.lon)}
                    onClick={() => onSelect(storedDestination(destination))}
                  />
                );
              })}
            </CardSection>
          ) : null}
        </div>
      );
  }

  return (
    <div className="flex flex-col gap-6">
      <label className="flex h-[52px] shrink-0 items-center gap-3 rounded-pill bg-surface px-5 transition-shadow focus-within:ring-1 focus-within:ring-pill-outline">
        <Search size={18} strokeWidth={2} aria-hidden className="shrink-0 text-text-3" />
        <input
          type="text"
          enterKeyHint="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => enterRows(event, event.currentTarget.closest("[data-drop]"))}
          aria-label="Search a city"
          placeholder="Search a city"
          className="min-w-0 flex-1 bg-transparent text-body-lg text-ink placeholder:text-text-muted focus-visible:outline-none"
        />
      </label>
      <div className="-m-2 max-h-[min(440px,calc(100dvh-400px))] overflow-y-auto p-2">{body}</div>
    </div>
  );
}

function Note({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <p role={alert ? "alert" : undefined} className={cn("flex items-center gap-2 px-2 py-2 text-ui", alert ? "text-amber" : "text-text-2")}>
      {children}
    </p>
  );
}

function CardSection({ label, columns, children }: { label: string; columns: 2 | 4; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <DropLabel inset="px-2">{label}</DropLabel>
      <div className={cn("grid gap-3", columns === 4 ? "grid-cols-4" : "grid-cols-2")}>{children}</div>
    </section>
  );
}

function CityCard({
  name,
  country,
  imageUrl,
  line,
  selected = false,
  onClick,
}: {
  name: string;
  country: string | null;
  imageUrl: string | null;
  line: { places: string | null; rest: string | null };
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-row
      onClick={onClick}
      aria-pressed={selected || undefined}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-card px-2 pt-2 pb-3 text-left transition-colors hover:bg-glow/25 focus-visible:bg-glow/25 focus-visible:outline-none",
        selected && "bg-glow/25",
      )}
    >
      <span className="relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-[14px] bg-avatar text-text-2">
        {imageUrl ? <FilmImage src={imageUrl} alt="" sizes="260px" /> : <MapPin size={22} strokeWidth={1.75} aria-hidden />}
      </span>
      <span className="flex items-baseline justify-between gap-2 px-1">
        <span title={name} className="truncate font-display text-card-sm leading-7 text-ink">
          {name}
        </span>
        {country ? <span className="shrink-0 text-ui-sm text-text-2">{country}</span> : null}
      </span>
      {line.places || line.rest ? (
        <span className="px-1 text-ui-sm text-text-3">
          {line.places ? <span className="font-semibold text-amber">{line.places}</span> : null}
          {line.places && line.rest ? " · " : null}
          {line.rest}
        </span>
      ) : null}
    </button>
  );
}

function ResultRow({
  title,
  description,
  count,
  selected,
  onClick,
}: {
  title: string;
  description?: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-row
      onClick={onClick}
      aria-pressed={selected || undefined}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-[16px] px-3 py-2.5 text-left transition-colors hover:bg-glow/25 focus-visible:bg-glow/25 focus-visible:outline-none",
        selected && "bg-glow/25",
      )}
    >
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-surface text-ink">
        <MapPin size={18} strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-lg leading-5 font-semibold text-ink">{title}</span>
        {description ? <span className="truncate text-ui-sm text-text-2">{description}</span> : null}
      </span>
      {count > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-pill-outline px-2.5 py-1 text-meta font-semibold text-ink">
          <BookmarkGlyph size={10} />
          {count} of your places
        </span>
      ) : null}
    </button>
  );
}
