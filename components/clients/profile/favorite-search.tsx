"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { Spinner } from "@/components/ui/spinner";
import { candidateDetail, MEDIA_KIND_LABEL } from "@/lib/clients/candidates";
import { cn } from "@/lib/ui/cn";

import { GROUP_LABEL, groupResults, SEARCH_TYPES } from "./search-groups";
import { MIN_QUERY, useEntitySearch, type TypedCandidate } from "./use-entity-search";

// C2 "Add a place, artist or film": one pill search over places (biased to
// the home city), artists and films, results grouped by kind under it. The
// highlighted row (the first by default) is added on Enter; with nothing
// found, Enter keeps the text as a place to match later.

export function FavoriteSearch({
  near,
  onPickPlace,
  onPickMedia,
  onKeepTyped,
}: {
  near: { lat: number; lon: number } | null;
  onPickPlace: (candidate: TypedCandidate, query: string) => void;
  onPickMedia: (candidate: TypedCandidate, query: string) => void;
  onKeepTyped: (query: string, results: TypedCandidate[]) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const { results: raw, state } = useEntitySearch(query, { types: SEARCH_TYPES, near });
  const results = groupResults(raw);
  const q = query.trim();
  const open = focused && q.length >= MIN_QUERY;
  const activeResult = results[active];

  function pick(candidate: TypedCandidate) {
    if (candidate.type === "place") onPickPlace(candidate, q);
    else onPickMedia(candidate, q);
    setQuery("");
    setActive(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    } else if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeResult) pick(activeResult);
      else if (state === "done" && q.length >= MIN_QUERY) {
        onKeepTyped(q, raw);
        setQuery("");
      }
    }
  }

  return (
    <div className="relative w-[300px] max-w-full shrink-0">
      <div className="flex h-11 items-center gap-2.5 rounded-pill border border-ink/14 bg-surface-raised px-4 transition-colors focus-within:border-ink">
        <Search size={16} strokeWidth={2} aria-hidden className="shrink-0 text-text-2" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder="Add a place, artist or film"
          aria-label="Add a place, artist or film"
          autoComplete="off"
          maxLength={120}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeResult ? `${listId}-${active}` : undefined}
          className="h-full min-w-0 grow bg-transparent text-body leading-5 text-ink placeholder:text-text-muted focus-visible:outline-none"
        />
        {state === "loading" ? <Spinner size={14} label="Searching" /> : null}
      </div>

      {open ? (
        <div className="rise-in absolute top-full right-0 z-50 mt-2 flex w-[440px] max-w-[calc(100vw-48px)] flex-col rounded-card bg-surface-raised p-2 shadow-results">
          <ul id={listId} role="listbox" aria-label="Places, artists and films" className="flex max-h-[380px] flex-col overflow-auto">
            {results.map((candidate, index) => {
              const heading = index === 0 || results[index - 1].type !== candidate.type ? GROUP_LABEL[candidate.type] : null;
              const detail =
                candidate.type === "place" ? candidateDetail(candidate) : MEDIA_KIND_LABEL[candidate.type === "movie" ? "movie" : "artist"];
              return (
                <li key={`${candidate.type}-${candidate.entityId}`} role="presentation" className="flex flex-col">
                  {heading ? (
                    <span className="px-3 pt-2 pb-1 text-meta font-semibold tracking-[0.08em] text-text-2 uppercase">{heading}</span>
                  ) : null}
                  <div
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(candidate)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors",
                      index === active && "bg-amber-wash",
                    )}
                  >
                    <span
                      className={cn(
                        "relative size-11 shrink-0 overflow-hidden bg-avatar",
                        candidate.type === "artist" ? "rounded-pill" : "rounded-[10px]",
                      )}
                    >
                      {candidate.imageUrl ? <FilmImage src={candidate.imageUrl} alt="" sizes="44px" /> : null}
                    </span>
                    <span className="flex min-w-0 grow flex-col gap-0.5">
                      <span className="truncate text-body leading-5 font-semibold text-ink">{candidate.name}</span>
                      {detail ? <span className="truncate text-ui-sm text-text-2">{detail}</span> : null}
                    </span>
                    {index === active ? <span className="shrink-0 pr-1 text-ui-sm font-semibold text-ink">Add</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {results.length === 0 ? (
            <p role="status" className="px-3 py-2.5 text-ui text-text-2">
              {state === "loading"
                ? "Searching"
                : state === "error"
                  ? "Search is unavailable right now. Try again in a moment."
                  : `Nothing found for “${q}”. Press Enter to keep it as a place to match later.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
