"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { MapPin, Plus, Search, X } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { Spinner } from "@/components/ui/spinner";
import { candidateDetail } from "@/lib/clients/candidates";
import { cn } from "@/lib/ui/cn";

import { MIN_QUERY, useEntitySearch, type TypedCandidate } from "../profile/use-entity-search";

// C1 "Places Ana loves": a large search field whose results open under it
// (photo, name, address), the highlighted row offering "+ Add place". Arrow
// keys move the highlight, Enter adds it. Every result is a real place from
// the recommendation search, so each pick is already matched; the added
// places list under the field until the client is saved.

const PLACE_TYPES = ["place"] as const;

export type PlacePick = {
  entityId: string;
  /** What the advisor typed when picking: the server repeats the search with it (a cache hit). */
  query: string;
  name: string;
  detail: string;
  imageUrl: string | null;
  near: { lat: number; lon: number } | null;
};

export function PlacesPicker({
  inputId,
  near,
  picks,
  onAdd,
  onRemove,
  placeholder,
}: {
  inputId: string;
  near: { lat: number; lon: number } | null;
  picks: PlacePick[];
  onAdd: (pick: PlacePick) => void;
  onRemove: (entityId: string) => void;
  placeholder: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { results, state } = useEntitySearch(query, { types: PLACE_TYPES, near });
  const q = query.trim();
  const picked = new Set(picks.map((pick) => pick.entityId));
  const open = q.length >= MIN_QUERY;
  const activeResult = results[active];

  function add(candidate: TypedCandidate) {
    if (picked.has(candidate.entityId)) return;
    onAdd({
      entityId: candidate.entityId,
      query: q || candidate.name,
      name: candidate.name,
      detail: candidateDetail(candidate),
      imageUrl: candidate.imageUrl ?? null,
      near,
    });
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeResult) add(activeResult);
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex h-[54px] shrink-0 items-center gap-3 rounded-2xl border-[1.5px] border-ink/30 bg-surface-raised px-[18px] transition-[border-color,box-shadow] focus-within:border-ink focus-within:ring-4 focus-within:ring-glow/25">
        <Search size={18} strokeWidth={2} aria-hidden className="shrink-0 text-ink" />
        <input
          ref={inputRef}
          id={inputId}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          maxLength={120}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeResult ? `${listId}-${active}` : undefined}
          className="h-full min-w-0 grow bg-transparent text-[17px] leading-[22px] font-medium text-ink placeholder:font-normal placeholder:text-text-muted focus-visible:outline-none"
        />
        {state === "loading" ? <Spinner size={16} label="Searching" /> : null}
      </div>

      {open ? (
        <div className="rise-in flex flex-col gap-1 rounded-card bg-surface-raised p-2 shadow-results">
          <p className="flex items-center gap-2 px-3 pt-2 pb-1.5 text-meta font-semibold tracking-[0.08em] text-text-2 uppercase">
            <MapPin size={14} strokeWidth={2} aria-hidden />
            Places
          </p>
          <ul id={listId} role="listbox" aria-label="Matching places" className="flex flex-col gap-1">
            {results.map((candidate, index) => {
              const isActive = index === active;
              const already = picked.has(candidate.entityId);
              const detail = candidateDetail(candidate);
              return (
                <li
                  key={candidate.entityId}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={already || undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => add(candidate)}
                  className={cn(
                    "flex cursor-pointer items-center gap-4 rounded-row py-2 pr-3 pl-2 transition-colors",
                    isActive && "bg-amber-wash",
                    already && "cursor-default",
                  )}
                >
                  <span className="relative h-16 w-24 shrink-0 overflow-hidden rounded-[10px] bg-avatar">
                    {candidate.imageUrl ? <FilmImage src={candidate.imageUrl} alt="" sizes="96px" /> : null}
                  </span>
                  <span className="w-[170px] shrink-0 truncate text-body-lg leading-5 font-semibold text-ink max-lg:w-[140px]">
                    {candidate.name}
                  </span>
                  <span className="min-w-0 grow truncate text-body leading-5 text-text-3">{detail}</span>
                  <span className="flex w-[150px] shrink-0 justify-end max-lg:w-[120px]">
                    {already ? (
                      <span className="text-ui font-semibold text-text-2">Added</span>
                    ) : isActive ? (
                      <span className="inline-flex items-center gap-2 rounded-pill bg-ink px-4 py-[9px] text-ui font-semibold text-surface">
                        <Plus size={14} strokeWidth={2.4} aria-hidden />
                        Add place
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {results.length === 0 ? (
            <p role="status" className="px-3 pt-1 pb-3 text-ui text-text-2">
              {state === "loading"
                ? "Searching"
                : state === "error"
                  ? "Place search is unavailable right now. Try again in a moment."
                  : `Nothing found for “${q}”. Try the full name, or add the neighborhood.`}
            </p>
          ) : null}
        </div>
      ) : null}

      {picks.length > 0 ? (
        <ul aria-label="Added places" className="flex flex-wrap gap-2.5">
          {picks.map((pick) => (
            <li
              key={pick.entityId}
              className="flex max-w-[340px] items-center gap-3 rounded-row border border-ink/14 bg-surface-raised py-1.5 pr-1.5 pl-1.5"
            >
              <span className="relative size-11 shrink-0 overflow-hidden rounded-[10px] bg-avatar">
                {pick.imageUrl ? <FilmImage src={pick.imageUrl} alt="" sizes="44px" /> : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-ui font-semibold text-ink">{pick.name}</span>
                {pick.detail ? <span className="truncate text-ui-sm text-text-2">{pick.detail}</span> : null}
              </span>
              <button
                type="button"
                aria-label={`Remove ${pick.name}`}
                title={`Remove ${pick.name}`}
                onClick={() => onRemove(pick.entityId)}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill text-text-muted transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <X size={14} strokeWidth={2.2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
