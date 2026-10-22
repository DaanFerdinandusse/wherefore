"use client";

import Link from "next/link";
import { useEffect, useState, type DragEvent } from "react";
import { Plus } from "lucide-react";

import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast } from "@/components/ui/toast";
import type { TripStage } from "@/lib/contracts";
import { moveTripToStage, resetTripStage } from "@/lib/trips/actions";
import { computeStage } from "@/lib/trips/stage";
import type { TripsBoardState } from "./columns";
import { cn } from "@/lib/ui/cn";

import { COLUMN_LIMIT, findCard, moveCard, restoreCard, STAGE_COLUMNS, stageLabel, totalTrips } from "./columns";
import { TripCard } from "./trip-card";

// The four stage columns. A drop on another column moves the card at once
// and saves the stage override in the background; a failed save puts the
// card back and says so. Each column shows its first cards and a "Show N
// more" for the rest.
export function TripsBoard({ initial, today }: { initial: TripsBoardState; today: string }) {
  const [grouped, setGrouped] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<TripStage | null>(null);
  const [expanded, setExpanded] = useState<Partial<Record<TripStage, boolean>>>({});
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  async function move(tripId: string, to: TripStage) {
    const card = findCard(grouped, tripId);
    if (!card || card.stage === to) return;
    setGrouped((current) => moveCard(current, tripId, to));
    setAnnouncement(`Moved ${card.title} to ${stageLabel(to)}.`);
    const result = await moveTripToStage(tripId, to);
    if (!result.ok) {
      setGrouped((current) => restoreCard(current, card));
      setAnnouncement("");
      setError(result.error);
    }
  }

  /** Drops the override: the card moves to the stage its dates and share link give it. */
  async function resetStage(tripId: string) {
    const card = findCard(grouped, tripId);
    if (!card || !card.stageOverride) return;
    const to = computeStage({ ...card, stageOverride: null }, today);
    setGrouped((current) => moveCard(current, tripId, to, null));
    setAnnouncement(`${card.title} is back in ${stageLabel(to)}.`);
    const result = await resetTripStage(tripId);
    if (!result.ok) {
      setGrouped((current) => restoreCard(current, card));
      setAnnouncement("");
      setError(result.error);
    } else if (result.stage !== to) {
      setGrouped((current) => moveCard(current, tripId, result.stage, null));
    }
  }

  function onDrop(event: DragEvent<HTMLElement>, stage: TripStage) {
    event.preventDefault();
    const tripId = event.dataTransfer.getData("text/plain") || dragId;
    setOverStage(null);
    setDragId(null);
    if (tripId) void move(tripId, stage);
  }

  if (totalTrips(grouped) === 0) {
    return (
      <div className="px-7 pt-2">
        <EmptyState
          title="Your trips will show up here"
          body="Pick a client and a city. The first list of places builds from what they already love."
          action={
            <Link href="/trips?new=1" scroll={false} className={buttonClasses({ className: "mt-1" })}>
              <Plus size={16} strokeWidth={2} aria-hidden />
              New trip
            </Link>
          }
          className="min-h-[360px]"
        />
      </div>
    );
  }

  const dragStage = dragId ? findCard(grouped, dragId)?.stage : undefined;

  return (
    <>
      <div className="grid grid-cols-4 gap-4 px-7">
        {STAGE_COLUMNS.map((column) => {
          const cards = grouped[column.stage];
          const showAll = expanded[column.stage] ?? false;
          const visible = showAll ? cards : cards.slice(0, COLUMN_LIMIT);
          const hidden = cards.length - visible.length;
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
                "flex min-w-0 flex-col gap-3 rounded-[26px] outline-2 outline-offset-4 outline-transparent transition-[outline-color]",
                isTarget && "outline-dashed outline-pill-outline",
              )}
            >
              <h2 id={`stage-${column.stage}`} className="flex items-center gap-2 px-1">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-pill", column.dotClass)} />
                <span className="flex-1 text-body leading-5 font-semibold text-ink">{column.label}</span>
                <span className="text-ui text-text-muted">{cards.length}</span>
              </h2>

              {visible.map((card, index) => (
                <TripCard
                  key={card.id}
                  card={card}
                  today={today}
                  eager={index < 3}
                  onResetStage={(id) => void resetStage(id)}
                  dragging={dragId === card.id}
                  onDragStart={setDragId}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  onMove={(id, stage) => void move(id, stage)}
                />
              ))}

              {cards.length === 0 ? (
                <div className="flex h-[120px] items-center justify-center rounded-[22px] border border-dashed border-rule-strong px-6 text-center text-ui-sm text-text-muted">
                  No trips here
                </div>
              ) : null}

              {hidden > 0 || showAll ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setExpanded((e) => ({ ...e, [column.stage]: !showAll }))}
                >
                  {showAll ? "Show fewer" : `Show ${hidden} more`}
                </Button>
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
