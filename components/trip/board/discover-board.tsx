"use client";

import { useMemo, type KeyboardEvent } from "react";
import { Sparkle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPill } from "@/components/ui/filter-pill";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import type { SlotName } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import type { BoardTab } from "../contracts";
import { useTripStore } from "../store";
import { askTitle, builtFromLine, firstName, TAB_LABELS } from "../workspace/format";
import {
  askIdOf,
  askTab,
  BOARD_CATEGORIES,
  dateOfDay,
  dayCount,
  liveAsks,
  nextFreeSlot,
  tabCounts,
  visiblePlaces,
  type BoardCategory,
} from "../workspace/reducer";
import { isSeeding } from "../workspace/seed";
import type { WorkspaceActions } from "../workspace/use-workspace-actions";

import { PlaceCard } from "./place-card";

// F6 / 02 Discover board: the header ("20 places for Ana" and where they came
// from), the filter pills (categories plus one per ask), and the grid: a
// featured card, then photo cards. While the seed runs, skeleton cards hold
// the place of each category that has nothing yet.

/** Arrow keys move between cards by position on screen. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"];
  if (!keys.includes(event.key)) return;
  const target = event.target as HTMLElement;
  if (target.tagName !== "A") return; // menus and buttons keep their own keys
  const current = event.currentTarget;
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-place-card]"));
  const index = cards.indexOf(current);
  if (index === -1) return;
  let next: HTMLElement | undefined;
  if (event.key === "ArrowRight") next = cards[index + 1];
  if (event.key === "ArrowLeft") next = cards[index - 1];
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    const from = current.getBoundingClientRect();
    const cx = from.left + from.width / 2;
    const below = event.key === "ArrowDown";
    let best = Infinity;
    for (const card of cards) {
      const r = card.getBoundingClientRect();
      const ok = below ? r.top >= from.bottom - 1 : r.bottom <= from.top + 1;
      if (!ok) continue;
      const score = Math.abs(below ? r.top - from.bottom : from.top - r.bottom) * 4 + Math.abs(r.left + r.width / 2 - cx);
      if (score < best) {
        best = score;
        next = card;
      }
    }
  }
  if (!next) return;
  event.preventDefault();
  next.querySelector<HTMLElement>("a")?.focus();
  next.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export function DiscoverBoard({ actions, onRetrySeed }: { actions: WorkspaceActions; onRetrySeed: () => void }) {
  const trip = useTripStore((s) => s.trip);
  const travelers = useTripStore((s) => s.travelers);
  const places = useTripStore((s) => s.places);
  const asks = useTripStore((s) => s.asks);
  const slots = useTripStore((s) => s.slots);
  const extraDays = useTripStore((s) => s.extraDays);
  const activeTab = useTripStore((s) => s.activeTab);
  const highlightedPlaceId = useTripStore((s) => s.highlightedPlaceId);
  const setTab = useTripStore((s) => s.setTab);
  const setHighlight = useTripStore((s) => s.setHighlight);
  const select = useTripStore((s) => s.select);

  const client = firstName(trip.clientName);
  const counts = useMemo(() => tabCounts({ places }), [places]);
  const visible = useMemo(() => visiblePlaces({ places, activeTab }), [places, activeTab]);
  const askList = useMemo(() => liveAsks({ asks }), [asks]);
  const days = dayCount({ trip, slots, extraDays });
  const picker = useMemo(
    () => ({
      days,
      dates: Array.from({ length: days }, (_, i) => dateOfDay(trip, i + 1)),
      slots,
      placeNames: Object.fromEntries(Object.values(places).map((p) => [p.tripPlaceId, p.name])),
    }),
    [days, trip, slots, places],
  );

  const activeAskId = askIdOf(activeTab);
  const activeAsk = activeAskId ? asks[activeAskId] : undefined;
  const seeding = isSeeding(trip.seedStatus);
  const failed = trip.seedStatus === "failed" && counts.all === 0;

  let title = counts.all > 0 ? `${counts.all} ${counts.all === 1 ? "place" : "places"} for ${client}` : `Places for ${client}`;
  let subtitle = seeding ? "Building the first list" : builtFromLine(trip.builtFrom, trip.destination.name, travelers);
  if (activeAsk) {
    title = askTitle(activeAsk.label);
    subtitle =
      activeAsk.status === "running"
        ? "Searching for your ask. Results land here and on the map."
        : activeAsk.status === "failed"
          ? "This search did not finish. Ask again in the chat."
          : [
              `${activeAsk.resultCount} found`,
              activeAsk.elapsedMs ? `${(activeAsk.elapsedMs / 1000).toFixed(1)} s` : null,
              activeAsk.loosened.length > 0 ? `widened by dropping ${activeAsk.loosened.join(" and ")}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
  }

  // Skeletons: per category with nothing yet while seeding; three for a running ask with no results.
  const skeletonCategories: BoardCategory[] = seeding && !activeAsk
    ? BOARD_CATEGORIES.filter((c) => counts[c] === 0 && (activeTab === "all" || activeTab === c))
    : [];
  const askSkeletons = activeAsk?.status === "running" && visible.length === 0 ? 3 : 0;

  const add = (tripPlaceId: string, day: number, slot: SlotName) => void actions.addToSlot(tripPlaceId, day, slot);

  const pills: { tab: BoardTab; label: string; count: number }[] = [
    { tab: "all", label: TAB_LABELS.all, count: counts.all },
    ...BOARD_CATEGORIES.map((c) => ({ tab: c as BoardTab, label: TAB_LABELS[c], count: counts[c] })),
  ];

  return (
    <section aria-label="Discover board" className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-title text-ink">{title}</h1>
          {subtitle ? <p className="text-body leading-[22px] text-text-muted">{subtitle}</p> : null}
        </div>
        <div role="toolbar" aria-label="Filter places" className="flex flex-wrap justify-end gap-2 pb-1">
          {pills.map((pill) => (
            <FilterPill
              key={pill.tab}
              label={pill.label}
              count={pill.count}
              active={activeTab === pill.tab}
              onClick={() => setTab(pill.tab)}
            />
          ))}
          {askList.map((ask) => (
            <FilterPill
              key={ask.id}
              label={ask.label}
              icon={<Sparkle size={12} strokeWidth={2} fill="currentColor" aria-hidden />}
              count={ask.status === "running" ? undefined : ask.resultCount}
              loading={ask.status === "running"}
              active={activeTab === askTab(ask.id)}
              onClick={() => setTab(askTab(ask.id))}
              onRemove={() => void actions.archiveAsk(ask.id)}
              removeLabel={`Close the ${ask.label} tab`}
            />
          ))}
        </div>
      </header>

      {failed ? (
        <EmptyState
          title="Could not build the first list"
          body={`The search for ${client}'s places did not finish. Retry starts it again; nothing on this trip is lost.`}
          action={<Button onClick={onRetrySeed}>Retry</Button>}
        />
      ) : visible.length === 0 && skeletonCategories.length === 0 && askSkeletons === 0 ? (
        <EmptyState
          title="Nothing on this tab yet"
          body={`Ask in the chat below, for example "a quiet dinner near the river", and the places land here.`}
        />
      ) : (
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
          {visible.map((card, i) => {
            const featured = i === 0;
            return (
              <PlaceCard
                key={card.tripPlaceId}
                card={card}
                clientName={trip.clientName}
                size={featured ? "lg" : "md"}
                arch={featured && !!card.yourPlace?.note}
                highlighted={highlightedPlaceId === card.tripPlaceId}
                fromAsk={!!activeAsk && card.source === "ask"}
                nextSlot={card.status === "added" ? null : nextFreeSlot({ trip, slots, extraDays }, card.category)}
                picker={picker}
                priority={i < 2}
                className={cn(featured ? "col-span-2 h-[340px]" : i === 1 ? "h-[340px]" : "h-[300px]")}
                onHover={setHighlight}
                onOpen={select}
                onAdd={add}
                onRemove={(id) => void actions.removePlace(id)}
                onKeyNav={moveFocus}
              />
            );
          })}
          {skeletonCategories.map((c) => (
            <div key={c} className="flex h-[300px] flex-col gap-2">
              <p className="label-caps text-text-2">{TAB_LABELS[c]}</p>
              <SkeletonCard clientName={client} className="min-h-0 flex-1" />
            </div>
          ))}
          {Array.from({ length: askSkeletons }, (_, i) => (
            <SkeletonCard key={i} clientName={client} className="h-[300px]" />
          ))}
        </div>
      )}
    </section>
  );
}
