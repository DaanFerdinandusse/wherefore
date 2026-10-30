"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";

import { Toast } from "@/components/ui/toast";
import type { TripStage } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { columnLimit, findCard, STAGE_COLUMNS, type TripsBoardState } from "./columns";
import { TripCard } from "./trip-card";
import { TripsEmpty } from "./trips-empty";
import { useTripMoves } from "./use-trip-moves";

// The four stage columns. A drop on another column moves the card at once
// and saves the stage override in the background; a failed save puts the
// card back and says so. Each column shows its first cards and a "Show N
// more" for the rest; past the loaded page it links to the list.

const MORE_CLASSES = "self-start rounded-pill px-3 py-2 text-ui-sm font-semibold text-ink hover:bg-ink/5";

export function TripsBoard({
  initial,
  totals,
  today,
  now,
}: {
  initial: TripsBoardState;
  /** Every trip per stage, loaded or not. */
  totals: Record<TripStage, number>;
  today: string;
  /** The server's clock as an ISO string, so server and client agree on "4 days". */
  now: string;
}) {
  const { grouped, move, resetStage, announcement, error } = useTripMoves(initial, today);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<TripStage | null>(null);
  const [expanded, setExpanded] = useState<Partial<Record<TripStage, boolean>>>({});
  const clock = new Date(now);

  function onDrop(event: DragEvent<HTMLElement>, stage: TripStage) {
    event.preventDefault();
    const tripId = event.dataTransfer.getData("text/plain") || dragId;
    setOverStage(null);
    setDragId(null);
    if (tripId) void move(tripId, stage);
  }

  if (STAGE_COLUMNS.every((c) => grouped[c.stage].length === 0)) return <TripsEmpty />;

  const dragStage = dragId ? findCard(grouped, dragId)?.stage : undefined;

  return (
    <>
      <div className="grid grid-cols-4 items-start gap-3">
        {STAGE_COLUMNS.map((column) => {
          const cards = grouped[column.stage];
          const limit = columnLimit(column.stage);
          const showAll = expanded[column.stage] ?? false;
          const visible = showAll ? cards : cards.slice(0, limit);
          // Moves change the loaded columns; the server total covers what is not loaded.
          const total = Math.max(cards.length, totals[column.stage] + cards.length - initial[column.stage].length);
          const hidden = total - visible.length;
          const isTarget = overStage === column.stage && dragStage !== undefined && dragStage !== column.stage;
          return (
            <section
              key={column.stage}
              aria-labelledby={`stage-${column.stage}`}
              onDragOver={(event) => {
                if (!dragId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (overStage !== column.stage) setOverStage(column.stage);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverStage(null);
              }}
              onDrop={(event) => onDrop(event, column.stage)}
              className={cn(
                "flex min-h-[160px] min-w-0 flex-col gap-2.5 rounded-[22px] outline-2 outline-offset-4 outline-transparent transition-[outline-color]",
                isTarget && "outline-dashed outline-pill-outline",
              )}
            >
              <h2 id={`stage-${column.stage}`} className="flex items-center gap-2 px-1">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-pill", column.dotClass)} />
                <span className="min-w-0 flex-1 truncate text-ui leading-[19px] font-semibold text-ink">{column.label}</span>
                <span className="text-ui-sm text-text-muted">{total}</span>
              </h2>

              {visible.map((card, index) => (
                <TripCard
                  key={card.id}
                  card={card}
                  today={today}
                  now={clock}
                  eager={index < 2}
                  dragging={dragId === card.id}
                  onDragStart={setDragId}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  onMove={(id, stage) => void move(id, stage)}
                  onResetStage={(id) => void resetStage(id)}
                />
              ))}

              {cards.length === 0 ? (
                <p className="flex h-[88px] items-center justify-center rounded-[18px] border-[1.5px] border-dashed border-ink/12 px-6 text-center text-ui-sm text-text-muted">
                  {dragStage !== undefined ? "Drop a trip here" : "No trips here"}
                </p>
              ) : null}

              {!showAll && hidden > 0 && cards.length > visible.length ? (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [column.stage]: true }))}
                  className={MORE_CLASSES}
                >
                  Show {hidden} more
                </button>
              ) : null}
              {hidden > 0 && cards.length === visible.length ? (
                <Link href="/trips?view=list" className={MORE_CLASSES}>
                  See all {total} in the list
                </Link>
              ) : null}
              {showAll && hidden <= 0 && cards.length > limit ? (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [column.stage]: false }))}
                  className="self-start rounded-pill px-3 py-2 text-ui-sm font-semibold text-text-3 hover:bg-ink/5 hover:text-ink"
                >
                  Show fewer
                </button>
              ) : null}
            </section>
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
