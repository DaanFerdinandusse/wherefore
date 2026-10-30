// Sorting for the Trips list. Pure, so the list and its tests share it.

import type { TripCard } from "@/lib/trips/contracts";

import { STAGE_COLUMNS, type TripsBoardState } from "./columns";

export type TripSortKey = "date" | "city" | "client" | "stage";
export type SortDirection = "asc" | "desc";
export type TripSort = { key: TripSortKey; direction: SortDirection };

/** Stage first (board order), then departure, soonest first. */
export const DEFAULT_SORT: TripSort = { key: "stage", direction: "asc" };

const STAGE_RANK = new Map(STAGE_COLUMNS.map((c, i) => [c.stage, i]));

function byText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

/** Departure dates ascending; trips without dates always go last, whatever the direction. */
function byDate(a: TripCard, b: TripCard, direction: SortDirection): number {
  if (!a.startDate && !b.startDate) return 0;
  if (!a.startDate) return 1;
  if (!b.startDate) return -1;
  const order = a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0;
  return direction === "asc" ? order : -order;
}

/** Every trip of the board as one list, in the given order. Ties fall back to departure, then title. */
export function sortTrips(grouped: TripsBoardState, sort: TripSort): TripCard[] {
  const all = STAGE_COLUMNS.flatMap((c) => grouped[c.stage]);
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...all].sort((a, b) => {
    let primary = 0;
    if (sort.key === "date") primary = byDate(a, b, sort.direction);
    if (sort.key === "city") primary = sign * byText(a.destination.name, b.destination.name);
    if (sort.key === "client") primary = sign * byText(a.clientName, b.clientName);
    if (sort.key === "stage") primary = sign * ((STAGE_RANK.get(a.stage) ?? 0) - (STAGE_RANK.get(b.stage) ?? 0));
    return primary || byDate(a, b, "asc") || byText(a.title, b.title);
  });
}

/** A click on a column header: the same column flips direction, another starts ascending. */
export function nextSort(current: TripSort, key: TripSortKey): TripSort {
  if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: "asc" };
}
