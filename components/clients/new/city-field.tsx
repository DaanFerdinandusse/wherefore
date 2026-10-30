"use client";

import { useEffect, useId, useState } from "react";
import { MapPin } from "lucide-react";

import { cn } from "@/lib/ui/cn";

import {
  fetchLocalities,
  LOCALITY_DEBOUNCE_MS,
  LOCALITY_MIN_QUERY,
  type HomeCity,
  type Locality,
} from "../localities";
import { fieldBoxClasses } from "./field";

// C1 "Home city": a boxed field with a pin and city suggestions under it.
// The highlighted suggestion (the first by default, arrow keys to change) is
// used on Enter, a click or leaving the field, so the city carries a point
// for the place search. Escape closes the suggestions.

export function CityField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: HomeCity;
  onChange: (city: HomeCity) => void;
}) {
  const listId = useId();
  const [text, setText] = useState(value.name);
  const [focused, setFocused] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; results: Locality[] } | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [committed, setCommitted] = useState(value.name);
  const q = text.trim();
  const changed = q !== committed.trim();

  useEffect(() => {
    if (!focused || q.length < LOCALITY_MIN_QUERY || !changed) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setAnswer({ q, results: await fetchLocalities(q, controller.signal) });
      } catch {
        if (!controller.signal.aborted) setAnswer({ q, results: [] });
      }
    }, LOCALITY_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [focused, q, changed]);

  const results = focused && changed && !dismissed && answer?.q === q ? answer.results : [];
  const open = results.length > 0;

  function pick(locality: Locality) {
    setCommitted(locality.name);
    setText(locality.name);
    setAnswer(null);
    onChange({ name: locality.name, lat: locality.lat, lon: locality.lon });
  }

  async function commitOnLeave() {
    if (!changed) return;
    if (!q) {
      setCommitted("");
      onChange({ name: "", lat: null, lon: null });
      return;
    }
    const best = results[active] ?? (await fetchLocalities(q).catch(() => []))[0];
    setCommitted(q);
    onChange({ name: q, lat: best?.lat ?? null, lon: best?.lon ?? null });
  }

  return (
    <div className="relative">
      <div className={cn(fieldBoxClasses, "gap-2.5")}>
        <MapPin size={16} strokeWidth={2} aria-hidden className="shrink-0 text-text-2" />
        <input
          id={id}
          value={text}
          placeholder="City"
          autoComplete="off"
          maxLength={120}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            void commitOnLeave();
          }}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setDismissed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              setDismissed(true);
            } else if (event.key === "ArrowDown" && open) {
              event.preventDefault();
              setActive((i) => (i + 1) % results.length);
            } else if (event.key === "ArrowUp" && open) {
              event.preventDefault();
              setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              const choice = results[active];
              if (choice) pick(choice);
            }
          }}
          className="h-full min-w-0 grow bg-transparent text-body-lg leading-5 font-medium text-ink placeholder:font-normal placeholder:text-text-muted focus-visible:outline-none"
        />
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching cities"
          className="rise-in absolute top-full right-0 left-0 z-50 mt-2 flex flex-col rounded-[18px] border border-rule-strong bg-surface-raised p-1.5 shadow-menu"
        >
          {results.map((locality, index) => (
            <li
              key={`${locality.name}-${locality.lat}-${locality.lon}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(locality)}
              className={cn("flex cursor-pointer flex-col rounded-xl px-3 py-2", index === active && "bg-surface-hover")}
            >
              <span className="text-ui font-semibold text-ink">{locality.name}</span>
              {locality.disambiguation ? (
                <span className="truncate text-ui-sm text-text-2">{locality.disambiguation}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
