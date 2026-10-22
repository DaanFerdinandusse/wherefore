// The four stage columns of the Trips board and the pure move used by the
// optimistic drag. The server decides the stage (lib/trips/stage.ts); the
// board only moves a card where the advisor dropped it.

import type { TripStage } from "@/lib/contracts";
import type { TripCard, TripsByStage } from "@/lib/trips/contracts";

/** The board state: cards per stage (the page of each `TripsByStage` column). */
export type TripsBoardState = Record<TripStage, TripCard[]>;

/** The page of cards per stage from `listTrips`, as the board holds them. */
export function boardState(grouped: TripsByStage): TripsBoardState {
  return {
    planning: grouped.planning.trips,
    shared: grouped.shared.trips,
    traveling: grouped.traveling.trips,
    done: grouped.done.trips,
  };
}

export type StageColumn = { stage: TripStage; label: string; dotClass: string };

export const STAGE_COLUMNS: readonly StageColumn[] = [
  { stage: "planning", label: "Planning", dotClass: "bg-ink" },
  { stage: "shared", label: "Shared with client", dotClass: "bg-ink" },
  { stage: "traveling", label: "Traveling now", dotClass: "bg-green" },
  { stage: "done", label: "Done", dotClass: "bg-ink/30" },
];

/** Cards shown per column before "Show N more". */
export const COLUMN_LIMIT = 6;

export function stageLabel(stage: TripStage): string {
  return STAGE_COLUMNS.find((c) => c.stage === stage)?.label ?? stage;
}

export function findCard(grouped: TripsBoardState, tripId: string): TripCard | undefined {
  for (const column of STAGE_COLUMNS) {
    const card = grouped[column.stage].find((c) => c.id === tripId);
    if (card) return card;
  }
  return undefined;
}

/**
 * The board after moving one trip to another stage: the card leaves its
 * column and goes to the top of the target, as the server's updated_at order
 * would put it. Returns the same object when nothing changes.
 */
export function moveCard(grouped: TripsBoardState, tripId: string, to: TripStage): TripsBoardState {
  const card = findCard(grouped, tripId);
  if (!card || card.stage === to) return grouped;
  return {
    ...grouped,
    [card.stage]: grouped[card.stage].filter((c) => c.id !== tripId),
    [to]: [{ ...card, stage: to }, ...grouped[to]],
  };
}

/** Puts a card back where it was, for a failed move. */
export function restoreCard(grouped: TripsBoardState, previous: TripCard): TripsBoardState {
  const current = findCard(grouped, previous.id);
  const without = current
    ? { ...grouped, [current.stage]: grouped[current.stage].filter((c) => c.id !== previous.id) }
    : grouped;
  return { ...without, [previous.stage]: [previous, ...without[previous.stage]] };
}

export function totalTrips(grouped: TripsBoardState): number {
  return STAGE_COLUMNS.reduce((sum, c) => sum + grouped[c.stage].length, 0);
}
