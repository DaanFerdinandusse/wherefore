"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/ui/cn";

import {
  fetchLocalities,
  LOCALITY_DEBOUNCE_MS as DEBOUNCE_MS,
  LOCALITY_MIN_QUERY as MIN_QUERY,
  type HomeCity,
  type Locality,
} from "../localities";
import { InlineText } from "./inline-text";

// "Lives in New York": the home city as inline text with locality
// suggestions under it while editing. The searches for places they love are
// biased to the city's point, so the city resolves to coordinates: the
// highlighted suggestion (the first by default, arrow keys to change) is used
// on Enter or blur. Escape puts the old city back.

export type { HomeCity };

export function HomeCityField({
  value,
  disabled,
  placeholder,
  onEditingChange,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  placeholder: string;
  onEditingChange: (editing: boolean) => void;
  /** Called once per edit with the chosen city (an empty name clears it). */
  onCommit: (city: HomeCity) => void;
}) {
  const listId = useId();
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; results: Locality[] } | null>(null);
  const [active, setActive] = useState(0);
  const [atFocus, setAtFocus] = useState(value);
  const clicked = useRef<number | null>(null);
  const q = text.trim();
  const changed = q !== atFocus.trim();

  useEffect(() => {
    if (!editing || q.length < MIN_QUERY || !changed) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setAnswer({ q, results: await fetchLocalities(q, controller.signal) });
      } catch {
        if (!controller.signal.aborted) setAnswer({ q, results: [] });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [editing, q, changed]);

  const results = editing && changed && answer?.q === q ? answer.results : [];
  const open = results.length > 0;

  async function commit() {
    setEditing(false);
    onEditingChange(false);
    if (!changed) return;
    if (!q) {
      onCommit({ name: "", lat: null, lon: null });
      return;
    }
    const index = clicked.current ?? active;
    clicked.current = null;
    const pick = results[index] ?? (await fetchLocalities(q).catch(() => []))[0];
    onCommit({ name: q, lat: pick?.lat ?? null, lon: pick?.lon ?? null });
  }

  return (
    <span
      className="relative inline-flex"
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActive((i) => (i + 1) % results.length);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
        }
      }}
    >
      <InlineText
        value={text}
        onValueChange={(next) => {
          setText(next);
          setActive(0);
        }}
        onFocus={() => {
          setAtFocus(text);
          setEditing(true);
          onEditingChange(true);
        }}
        onCommit={() => void commit()}
        onCancel={() => {
          setText(atFocus);
          setEditing(false);
          onEditingChange(false);
        }}
        label="Home city"
        placeholder={placeholder}
        disabled={disabled}
        maxLength={120}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        inputClassName="text-body leading-[22px] text-text-3"
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching cities"
          className="rise-in absolute top-full left-0 z-50 mt-2 flex w-[360px] flex-col rounded-[18px] border border-rule-strong bg-surface-raised p-1.5 shadow-menu"
        >
          {results.map((locality, index) => (
            <li
              key={`${locality.name}-${locality.lat}-${locality.lon}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                clicked.current = index;
                (document.activeElement as HTMLElement | null)?.blur();
              }}
              className={cn("flex cursor-pointer flex-col rounded-xl px-3 py-2", index === active && "bg-surface-hover")}
            >
              <span className="text-ui font-semibold text-ink">{locality.name}</span>
              {locality.disambiguation ? <span className="truncate text-ui-sm text-text-2">{locality.disambiguation}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
