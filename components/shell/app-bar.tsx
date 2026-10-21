"use client";

import { usePathname, useRouter } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NavPill } from "@/components/ui/nav-pill";
import { UnderlineField } from "@/components/ui/underline-field";

import { flattenResults, optionId, SearchResultsPanel, type SearchResult, type SearchResults } from "./search-results";
import { UserMenu } from "./user-menu";
import { Wordmark } from "./wordmark";

// The app bar on every signed-in page: wordmark, Trips / Clients / My places,
// a centered search with a grouped results dropdown, "+ New trip" and the
// advisor's avatar menu. Search is a combobox: type, arrow through the
// results, Enter opens one, Escape closes. The results arrive as props; the
// query can be controlled (`query`, `onQueryChange`) or left to the bar.
export type AppSection = "trips" | "clients" | "places";

const NAV: { key: AppSection; label: string; href: string }[] = [
  { key: "trips", label: "Trips", href: "/trips" },
  { key: "clients", label: "Clients", href: "/clients" },
  { key: "places", label: "My places", href: "/places" },
];

const NO_RESULTS: SearchResults = { clients: [], trips: [], places: [] };

export function AppBar({
  userName,
  active,
  query: controlledQuery,
  onQueryChange,
  results = NO_RESULTS,
  searching = false,
  onSelectResult,
  onNewTrip,
  onSignOut,
}: {
  userName: string;
  /** Highlighted section; read from the URL when omitted. */
  active?: AppSection;
  query?: string;
  onQueryChange?: (query: string) => void;
  results?: SearchResults;
  searching?: boolean;
  /** Defaults to navigating to the result's href. */
  onSelectResult?: (result: SearchResult) => void;
  onNewTrip: () => void;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const listId = useId();
  const [ownQuery, setOwnQuery] = useState("");
  const query = controlledQuery ?? ownQuery;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  const section = active ?? NAV.find((item) => pathname?.startsWith(item.href))?.key;
  const flat = flattenResults(results);
  const showPanel = open && query.trim().length > 0;
  const activeResult = activeIndex >= 0 ? flat[activeIndex] : undefined;

  function setQuery(next: string) {
    if (controlledQuery === undefined) setOwnQuery(next);
    onQueryChange?.(next);
    setActiveIndex(-1);
    setOpen(true);
  }

  function select(result: SearchResult) {
    setOpen(false);
    if (onSelectResult) onSelectResult(result);
    else router.push(result.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!showPanel || flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeResult) {
      event.preventDefault();
      select(activeResult);
    }
  }

  return (
    <header className="flex h-[76px] shrink-0 items-center gap-6 px-7">
      <div className="flex min-w-max flex-1 basis-0 items-center gap-7">
        <Wordmark />
        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV.map((item) => (
            <NavPill key={item.key} href={item.href} active={section === item.key}>
              {item.label}
            </NavPill>
          ))}
        </nav>
      </div>

      <div
        ref={searchRef}
        className="relative w-[420px] min-w-[200px] shrink"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <UnderlineField
          value={query}
          onValueChange={setQuery}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          label="Search clients, trips or places"
          placeholder="Search clients, trips or places"
          clearLabel="Clear search"
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeResult ? optionId(listId, activeResult.group, activeResult.id) : undefined}
          autoComplete="off"
        />
        {showPanel ? (
          <SearchResultsPanel
            listId={listId}
            query={query.trim()}
            results={results}
            searching={searching}
            activeId={activeResult ? optionId(listId, activeResult.group, activeResult.id) : undefined}
            onSelect={select}
          />
        ) : null}
      </div>

      <div className="flex min-w-max flex-1 basis-0 items-center justify-end gap-3.5">
        <Button icon={<Plus size={16} strokeWidth={2} aria-hidden />} onClick={onNewTrip}>
          New trip
        </Button>
        <UserMenu userName={userName} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
