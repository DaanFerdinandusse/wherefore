"use client";

import Image from "next/image";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/ui/cn";

// The grouped dropdown under the search: clients, trips, places.
// A shell only: the results come in as props (the fetch lives with the
// search owner). Rows are options of the search combobox; the active one is
// driven by the arrow keys there.
export type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  imageUrl?: string;
};

export type SearchResults = {
  clients: SearchResult[];
  trips: SearchResult[];
  places: SearchResult[];
};

export type SearchGroup = keyof SearchResults;

export const SEARCH_GROUPS: { key: SearchGroup; label: string }[] = [
  { key: "clients", label: "Clients" },
  { key: "trips", label: "Trips" },
  { key: "places", label: "Places" },
];

/** The results in display order, for keyboard navigation. */
export function flattenResults(results: SearchResults): (SearchResult & { group: SearchGroup })[] {
  return SEARCH_GROUPS.flatMap(({ key }) => results[key].map((result) => ({ ...result, group: key })));
}

export function optionId(listId: string, group: SearchGroup, id: string) {
  return `${listId}-${group}-${id}`;
}

export function SearchResultsPanel({
  listId,
  query,
  results,
  searching,
  activeId,
  onSelect,
}: {
  listId: string;
  query: string;
  results: SearchResults;
  searching: boolean;
  /** Option id of the keyboard-active row. */
  activeId?: string;
  onSelect: (result: SearchResult) => void;
}) {
  const total = results.clients.length + results.trips.length + results.places.length;

  return (
    <div className="rise-in absolute top-full right-0 left-0 z-50 mt-2 rounded-[18px] border border-rule-strong bg-surface-raised p-1.5 shadow-menu">
      <div id={listId} role="listbox" aria-label="Search results" className="flex max-h-[60vh] flex-col overflow-auto">
        {SEARCH_GROUPS.map(({ key, label }) =>
          results[key].length > 0 ? (
            <div key={key} role="group" aria-labelledby={`${listId}-${key}`} className="flex flex-col pb-1">
              <p id={`${listId}-${key}`} role="presentation" className="label-caps px-3 pt-2.5 pb-1.5 leading-[14px] text-text-2">
                {label}
              </p>
              {results[key].map((result) => {
                const id = optionId(listId, key, result.id);
                const active = id === activeId;
                return (
                  <Link
                    key={result.id}
                    id={id}
                    href={result.href}
                    role="option"
                    aria-selected={active}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.preventDefault();
                      onSelect(result);
                    }}
                    className={cn(
                      "flex items-center gap-3.5 rounded-xl px-3 py-2 transition-colors hover:bg-surface-hover",
                      active && "bg-surface-hover",
                    )}
                  >
                    {key === "clients" ? (
                      <Avatar name={result.title} size={38} src={result.imageUrl} />
                    ) : (
                      <span className="relative size-[38px] shrink-0 overflow-hidden rounded-[10px] bg-avatar">
                        {result.imageUrl ? (
                          <Image src={result.imageUrl} alt="" fill sizes="38px" className="film object-cover" />
                        ) : null}
                      </span>
                    )}
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-body leading-5 font-semibold text-ink">{result.title}</span>
                      {result.subtitle ? <span className="truncate text-ui-sm text-text-2">{result.subtitle}</span> : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null,
        )}
      </div>
      {total === 0 ? (
        <p role="status" className="px-3 py-3 text-ui text-text-2">
          {searching ? "Searching" : `No clients, trips or places match “${query}”.`}
        </p>
      ) : searching ? (
        <p role="status" className="sr-only">
          Updating results
        </p>
      ) : null}
    </div>
  );
}
