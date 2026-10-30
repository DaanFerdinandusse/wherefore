"use client";

import { createElement, useState } from "react";
import {
  BedDouble,
  Check,
  ChevronDown,
  CloudSun,
  Coffee,
  Landmark,
  MapPin,
  Moon,
  MoonStar,
  Search,
  Sun,
  Sunrise,
  Utensils,
  Wine,
  type LucideIcon,
} from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { Popover } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { Category, SlotName } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { searchesByTime, searchRow, type MapSearch } from "./map-panel-model";

// The second row under the day tabs: one chat search as a small tab, the one
// on the map or else the newest, and "6 more" for the full list with photos.
// Days stay one click away and a long chat never adds a tab. Clicking the
// search that is on turns it off. The list runs morning to night, each search
// with an icon for its time, or for its kind of place when it has no time.

const LIST_MIN_HEIGHT = 200;
/** The day tabs, this row and a margin above the list. */
const LIST_OFFSET = 136;

const TIME_ICON: Record<Exclude<SlotName, "stay">, LucideIcon> = {
  breakfast: Coffee,
  morning: Sunrise,
  lunch: Sun,
  afternoon: CloudSun,
  dinner: Moon,
  night: MoonStar,
};

const CATEGORY_ICON: Record<Category, LucideIcon> = {
  eat: Utensils,
  drink: Wine,
  coffee: Coffee,
  see: Landmark,
  stay: BedDouble,
  other: MapPin,
};

function searchIcon(search: MapSearch): LucideIcon {
  if (search.time && search.time !== "stay") return TIME_ICON[search.time];
  return CATEGORY_ICON[search.places[0]?.category ?? "other"];
}

export function SearchTabs({
  searches,
  activeId,
  height,
  onPick,
}: {
  searches: MapSearch[];
  activeId: string | null;
  /** The map's height: a shorter map scrolls the list sooner. */
  height: number;
  onPick: (searchId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = searches.find((s) => s.id === activeId) ?? searches[0];
  if (!shown) return null;
  const on = shown.id === activeId;
  const more = searches.length - 1;

  return (
    <div
      role="group"
      aria-label="Show a search on the map"
      className="relative flex max-w-full items-center gap-0.5 rounded-pill bg-surface/90 p-[3px] shadow-[0_4px_12px_rgb(22_19_15/0.1)] backdrop-blur-[12px]"
    >
      <Search size={13} strokeWidth={2.2} aria-hidden className="mx-1.5 shrink-0 text-text-2" />
      <button
        type="button"
        aria-pressed={on}
        title={shown.label}
        onClick={() => onPick(shown.id)}
        className={cn(
          "inline-flex max-w-[260px] min-w-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-meta leading-4 font-medium transition-colors",
          on ? "bg-ink text-surface" : "text-ink hover:bg-ink/5",
        )}
      >
        {shown.running ? <Spinner size={11} /> : null}
        <span className="truncate">{shown.label}</span>
      </button>
      {more > 0 ? (
        <Popover
          open={open}
          onOpenChange={setOpen}
          label="All searches"
          // The list hangs from the row, so it stays on the map wherever "more" ends up.
          className="static! shrink-0"
          panelClassName="w-[376px] max-w-[calc(100vw-48px)] p-1.5!"
          trigger={(props) => (
            <button
              type="button"
              {...props}
              className="inline-flex items-center gap-1 rounded-pill py-1 pr-1.5 pl-2.5 text-meta leading-4 font-semibold whitespace-nowrap text-ink transition-colors hover:bg-ink/5"
            >
              {more} more
              <ChevronDown size={13} strokeWidth={2.2} aria-hidden className={cn("transition-transform duration-200", open && "rotate-180")} />
            </button>
          )}
        >
          <ul className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: Math.max(LIST_MIN_HEIGHT, height - LIST_OFFSET) }}>
            {searchesByTime(searches).map((search) => (
              <li key={search.id}>
                <SearchListRow
                  search={search}
                  on={search.id === activeId}
                  onPick={() => {
                    setOpen(false);
                    onPick(search.id);
                  }}
                />
              </li>
            ))}
          </ul>
        </Popover>
      ) : null}
    </div>
  );
}

function SearchListRow({ search, on, onPick }: { search: MapSearch; on: boolean; onPick: () => void }) {
  const { title, detail } = searchRow(search);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cn("flex w-full items-center gap-3 rounded-row p-1.5 text-left transition-colors", on ? "bg-why" : "hover:bg-ink/5")}
    >
      {/* Three slots whatever the search found, so the titles line up. */}
      <span aria-hidden className="grid shrink-0 grid-cols-3 gap-0.5 overflow-hidden rounded-[10px]">
        {[0, 1, 2].map((i) => {
          const src = search.photos[i];
          return (
            <span key={i} className="relative size-9 bg-avatar">
              {src ? <FilmImage src={src} alt="" sizes="36px" unoptimized /> : null}
            </span>
          );
        })}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          {createElement(searchIcon(search), { size: 15, strokeWidth: 2, "aria-hidden": true, className: "shrink-0 text-amber" })}
          <span className="truncate text-ui-sm font-semibold text-ink">{title}</span>
        </span>
        <span className="truncate text-meta text-text-2">{detail}</span>
      </span>
      {on ? <Check size={15} strokeWidth={2.4} aria-hidden className="mr-1 shrink-0 text-amber" /> : null}
    </button>
  );
}
