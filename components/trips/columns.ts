// The four stage columns of the Trips board and the pure move used by the
// optimistic drag. The server decides the stage (lib/trips/stage.ts); the
// board only moves a card where the advisor dropped it.

import type { TripStage } from "@/lib/contracts";
import type { TripCard, TripsByStage } from "@/lib/trips/contracts";

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

export function findCard(grouped: TripsByStage, tripId: string): TripCard | undefined {
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
export function moveCard(grouped: TripsByStage, tripId: string, to: TripStage): TripsByStage {
  const card = findCard(grouped, tripId);
  if (!card || card.stage === to) return grouped;
  return {
    ...grouped,
    [card.stage]: grouped[card.stage].filter((c) => c.id !== tripId),
    [to]: [{ ...card, stage: to }, ...grouped[to]],
  };
}

/** Puts a card back where it was, for a failed move. */
export function restoreCard(grouped: TripsByStage, previous: TripCard): TripsByStage {
  const current = findCard(grouped, previous.id);
  const without = current
    ? { ...grouped, [current.stage]: grouped[current.stage].filter((c) => c.id !== previous.id) }
    : grouped;
  return { ...without, [previous.stage]: [previous, ...without[previous.stage]] };
}

export function totalTrips(grouped: TripsByStage): number {
  return STAGE_COLUMNS.reduce((sum, c) => sum + grouped[c.stage].length, 0);
}
