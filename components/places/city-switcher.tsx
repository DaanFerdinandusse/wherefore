"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { MapPin, Search } from "lucide-react";
import { z } from "zod";

import { FilmImage } from "@/components/ui/film-image";
import { cn } from "@/lib/ui/cn";

import { sameCity, type CitySummary } from "./city";
import { placesHref } from "./format";

// The "Where" control in the panel header (H4) and its city picker (H5):
// the city in view with its photo, and "Change city" opening a search field
// over a dropdown of the advisor's cities. Typing filters the tiles; a name
// that is none of them is looked up as a locality, so "Porto" opens Porto
// (spelled the way trips store it) and the advisor can start saving there.

const LOCALITY_DEBOUNCE_MS = 250;
const localitiesSchema = z.object({
  candidates: z.array(z.object({ name: z.string(), disambiguation: z.string().optional() })),
});
type Locality = z.infer<typeof localitiesSchema>["candidates"][number];

export function CitySwitcher({
  current,
  cities,
  total,
  list,
}: {
  /** The city in view; a city without places yet has count 0. Null before any city. */
  current: CitySummary | null;
  cities: CitySummary[];
  total: number;
  list: "mine" | "team";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [scrim, setScrim] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const q = query.trim().toLocaleLowerCase("en");
  const shown = q
    ? cities.filter((c) => c.city.toLocaleLowerCase("en").includes(q) || c.country?.toLocaleLowerCase("en").includes(q))
    : cities;
  const newCities = localities.filter((l) => !cities.some((c) => sameCity(c.city, l.name))).slice(0, 3);

  function close(returnFocus = true) {
    setOpen(false);
    setQuery("");
    setLocalities([]);
    setLookingUp(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function go(city: string) {
    close(false);
    router.push(placesHref({ city, list }));
  }

  // The scrim dims the panel body under the header, as in the design.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const header = rootRef.current?.closest("header");
      const panel = header?.parentElement;
      if (!header || !panel) return;
      const h = header.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      setScrim({ top: h.bottom, left: p.left, width: p.width, height: Math.max(0, p.bottom - h.bottom) });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // A click outside the field and the dropdown closes it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  // Look the typed name up as a locality, for cities the advisor has no places in yet.
  useEffect(() => {
    if (!open || q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookingUp(true);
      try {
        const response = await fetch(`/api/localities/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        setLocalities(localitiesSchema.parse(await response.json()).candidates);
      } catch {
        // Aborted or offline: the tiles still work.
      } finally {
        if (!controller.signal.aborted) setLookingUp(false);
      }
    }, LOCALITY_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, q, query]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = shown[0]?.city ?? newCities[0]?.name;
      if (target) go(target);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      rootRef.current?.querySelector<HTMLElement>("[data-city-option]")?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <div className="flex h-12 w-110 max-w-[calc(100vw-420px)] min-w-72 items-center gap-3 rounded-pill bg-white px-4.5 shadow-[0_0_0_1.5px_var(--color-ink),0_8px_24px_rgb(22_19_15/0.1)]">
          <Search size={18} strokeWidth={2} aria-hidden className="shrink-0 text-ink" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim().length < 2) setLocalities([]);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search a city"
            aria-label="Search a city"
            aria-controls={listId}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-body-lg leading-[22px] text-ink placeholder:text-text-muted focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={() => close()}
            aria-label="Close the city picker"
            className="shrink-0 rounded-md bg-surface px-1.75 py-0.75 text-meta font-semibold text-text-2 hover:text-ink"
          >
            Esc
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={false}
          className="group flex h-12 w-110 max-w-[calc(100vw-420px)] min-w-72 items-center gap-3 rounded-pill bg-white pr-2 pl-1.5 text-left shadow-[0_0_0_1px_rgb(22_19_15/0.12),0_4px_12px_rgb(22_19_15/0.06)]"
        >
          <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-avatar text-text-2">
            {current?.imageUrl ? (
              <FilmImage src={current.imageUrl} alt="" sizes="36px" className="object-cover" />
            ) : (
              <MapPin size={16} strokeWidth={2} aria-hidden />
            )}
          </span>
          <span className="flex min-w-0 grow flex-col gap-px">
            <span className="text-label leading-[14px] font-semibold tracking-[0.12em] text-text-2 uppercase">Where</span>
            <span className="truncate text-body leading-5 font-semibold text-ink">
              {current ? (
                <>
                  {current.city}
                  {current.country ? <span className="font-normal text-text-2">, {current.country}</span> : null}
                </>
              ) : (
                <span className="font-normal text-text-2">Pick a city</span>
              )}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-pill bg-surface px-3 py-2 text-ui-sm font-semibold text-ink transition-colors group-hover:bg-canvas">
            <Search size={14} strokeWidth={2} aria-hidden />
            Change city
          </span>
        </button>
      )}

      {open ? (
        <>
          {scrim ? (
            <div
              aria-hidden
              onPointerDown={() => close(false)}
              style={scrim}
              className="fixed z-40 rounded-b-sheet bg-ink/20"
            />
          ) : null}
          <div
            id={listId}
            role="dialog"
            aria-label="Your cities"
            className="rise-in absolute top-[calc(100%+8px)] left-0 z-50 flex w-[min(1112px,calc(100vw-64px))] flex-col gap-5 rounded-menu bg-surface-raised p-6 shadow-[0_24px_64px_rgb(22_19_15/0.3)]"
          >
            {cities.length > 0 ? (
              <div className="flex items-baseline justify-between gap-4 px-2">
                <h2 className="text-meta font-semibold tracking-[0.12em] text-text-2 uppercase">Your cities</h2>
                <p className="text-ui-sm text-text-2">
                  {total} {total === 1 ? "place" : "places"} in {cities.length} {cities.length === 1 ? "city" : "cities"}
                </p>
              </div>
            ) : null}

            {shown.length > 0 ? (
              <ul className="grid max-h-[min(560px,60vh)] grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 overflow-y-auto">
                {shown.map((city) => (
                  <li key={city.city}>
                    <CityTile city={city} current={!!current && sameCity(current.city, city.city)} href={placesHref({ city: city.city, list })} onPick={() => close(false)} />
                  </li>
                ))}
              </ul>
            ) : q && cities.length > 0 ? (
              <p className="px-2 text-ui text-text-2">None of your cities match {"“"}{query.trim()}{"”"}.</p>
            ) : null}

            <div className={cn("flex flex-col gap-1 px-2", cities.length > 0 && "border-t border-ink/8 pt-3.5")}>
              {newCities.length > 0 ? (
                newCities.map((locality) => (
                  <button
                    key={`${locality.name}|${locality.disambiguation ?? ""}`}
                    type="button"
                    data-city-option
                    onClick={() => go(locality.name)}
                    className="-mx-2 flex items-center gap-2.5 rounded-row px-2 py-2 text-left hover:bg-surface focus-visible:bg-surface"
                  >
                    <MapPin size={16} strokeWidth={2} aria-hidden className="shrink-0 text-text-2" />
                    <span className="text-ui font-semibold text-ink">Open {locality.name}</span>
                    {locality.disambiguation ? (
                      <span className="truncate text-ui text-text-2">{locality.disambiguation}</span>
                    ) : null}
                  </button>
                ))
              ) : (
                <p role="status" className="flex items-center gap-2.5 text-ui leading-5 text-text-3">
                  <MapPin size={16} strokeWidth={2} aria-hidden className="shrink-0 text-text-2" />
                  {lookingUp && q.length >= 2
                    ? `Looking up “${query.trim()}”`
                    : "New city? Type its name to open it and start saving places there."}
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CityTile({
  city,
  current,
  href,
  onPick,
}: {
  city: CitySummary;
  current: boolean;
  href: string;
  onPick: () => void;
}) {
  const detail = current ? city.mix : (city.fact ?? city.mix);
  return (
    <Link
      href={href}
      onClick={onPick}
      data-city-option
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex flex-col gap-2.5 rounded-[20px] px-2 pt-2 pb-3 transition-colors",
        current ? "bg-amber-wash" : "hover:bg-surface focus-visible:bg-surface",
      )}
    >
      <span className="relative block h-37.5 overflow-hidden rounded-row bg-avatar">
        {city.imageUrl ? <FilmImage src={city.imageUrl} alt="" sizes="260px" className="object-cover" /> : null}
        {current ? (
          <span className="absolute top-2.5 left-2.5 rounded-pill bg-ink/80 px-2.5 py-1 text-meta font-semibold text-surface-raised">
            Showing now
          </span>
        ) : null}
      </span>
      <span className="flex items-baseline justify-between gap-2 px-1">
        <span className="min-w-0 font-display text-tile text-ink">{city.city}</span>
        {city.country ? <span className="shrink-0 text-ui-sm text-text-2">{city.country}</span> : null}
      </span>
      <span className="px-1 text-ui-sm text-text-3">
        <span className="font-semibold text-amber">
          {city.count} {city.count === 1 ? "place" : "places"}
        </span>
        {detail ? ` · ${detail}` : null}
      </span>
    </Link>
  );
}
