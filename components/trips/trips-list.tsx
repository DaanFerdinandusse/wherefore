"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/ui/cn";

import { STAGE_COLUMNS, type TripsBoardState } from "./columns";
import { cardDatesLabel } from "./format";
import { DEFAULT_SORT, nextSort, sortTrips, type TripSort, type TripSortKey } from "./sort";
import { cardStatus } from "./status";
import { StatusMeta } from "./status-line";
import { TripActionsMenu } from "./trip-actions-menu";
import { TripsEmpty } from "./trips-empty";
import { useTripMoves } from "./use-trip-moves";

// The List view: every trip in one dense table, sortable by trip, client,
// dates and stage (stage then departure by default). A row opens its trip;
// the "..." menu moves it to another stage like a drag on the board.

const GRID =
  "grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)_minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(0,1.8fr)_40px] items-center gap-4";

const COLUMNS: { key: TripSortKey | null; label: string }[] = [
  { key: "city", label: "Trip" },
  { key: "client", label: "Client" },
  { key: "date", label: "Dates" },
  { key: "stage", label: "Stage" },
  { key: null, label: "Status" },
];

const STAGE_BY_KEY = new Map(STAGE_COLUMNS.map((c) => [c.stage, c]));

export function TripsList({ initial, today, now }: { initial: TripsBoardState; today: string; now: string }) {
  const { grouped, move, resetStage, announcement, error } = useTripMoves(initial, today);
  const [sort, setSort] = useState<TripSort>(DEFAULT_SORT);
  const clock = new Date(now);
  const trips = sortTrips(grouped, sort);

  if (trips.length === 0) return <TripsEmpty />;

  return (
    <>
      <div
        role="table"
        aria-label="Trips"
        aria-rowcount={trips.length + 1}
        className="flex flex-col overflow-hidden rounded-[18px] bg-surface-raised shadow-[0_1px_3px_rgb(22_19_15/0.06),0_0_0_1px_rgb(22_19_15/0.04)]"
      >
        <div role="row" className={cn(GRID, "border-b border-ink/8 px-4 py-2.5")}>
          {COLUMNS.map((column) => {
            const active = column.key !== null && sort.key === column.key;
            return (
              <div
                key={column.label}
                role="columnheader"
                aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                className="min-w-0"
              >
                {column.key ? (
                  <button
                    type="button"
                    onClick={() => setSort((current) => nextSort(current, column.key as TripSortKey))}
                    className={cn(
                      "-mx-2 inline-flex items-center gap-1 rounded-pill px-2 py-1 text-micro font-semibold tracking-[0.04em] uppercase hover:bg-ink/5",
                      active ? "text-ink" : "text-text-muted hover:text-ink",
                    )}
                  >
                    {column.label}
                    {active ? (
                      sort.direction === "asc" ? (
                        <ArrowUp size={12} strokeWidth={2.4} aria-hidden />
                      ) : (
                        <ArrowDown size={12} strokeWidth={2.4} aria-hidden />
                      )
                    ) : null}
                  </button>
                ) : (
                  <span className="text-micro font-semibold tracking-[0.04em] text-text-muted uppercase">
                    {column.label}
                  </span>
                )}
              </div>
            );
          })}
          <span role="columnheader" className="sr-only">
            Actions
          </span>
        </div>

        {trips.map((card) => {
          const stage = STAGE_BY_KEY.get(card.stage);
          return (
            <div
              key={card.id}
              role="row"
              className={cn(
                GRID,
                "group relative border-b border-ink/6 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-surface",
              )}
            >
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <span className="relative h-9 w-[54px] shrink-0 overflow-hidden rounded-[8px] bg-avatar">
                  {card.imageUrl ? <FilmImage src={card.imageUrl} alt="" sizes="54px" /> : null}
                </span>
                <Link
                  href={`/trips/${card.id}`}
                  className="min-w-0 truncate font-display text-city-sm text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-glow"
                >
                  {card.destination.name}
                </Link>
              </div>
              <div role="cell" className="min-w-0 truncate text-ui-sm font-semibold text-text-3">
                {card.clientName}
              </div>
              <div role="cell" className="min-w-0 truncate text-ui-sm text-text-2">
                {cardDatesLabel(card)}
              </div>
              <div role="cell" className="flex min-w-0 items-center gap-2 text-ui-sm text-ink">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-pill", stage?.dotClass)} />
                <span className="truncate">{stage?.label ?? card.stage}</span>
              </div>
              <div role="cell" className="flex min-w-0 items-center">
                <StatusMeta status={cardStatus(card, today, clock)} className="max-w-full" />
              </div>
              <div role="cell" className="relative z-10 flex justify-end">
                <TripActionsMenu card={card} onMove={(id, to) => void move(id, to)} onResetStage={(id) => void resetStage(id)} />
              </div>
            </div>
          );
        })}
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {error ? <Toast message={error} /> : null}
    </>
  );
}
