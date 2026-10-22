// The per-tab client state mirrored to the URL for deep links and the back
// button: ?view=map&tab=<askId|category>&place=<tripPlaceId>. Pure parsing and
// formatting; the store writes it with history.replaceState.

import type { BoardTab, TripView } from "../contracts";

import { askIdOf, BOARD_CATEGORIES } from "./reducer";

export type UrlState = { view: TripView; activeTab: BoardTab; selectedPlaceId: string | null };

const VIEWS: readonly TripView[] = ["board", "map", "itinerary", "traveler"];
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ParamsLike = { get(name: string): string | null };

export function readUrlState(params: ParamsLike): UrlState {
  const view = params.get("view");
  const tab = params.get("tab");
  const place = params.get("place");
  return {
    view: view && (VIEWS as readonly string[]).includes(view) ? (view as TripView) : "board",
    activeTab: parseTab(tab),
    selectedPlaceId: place && ID_RE.test(place) ? place : null,
  };
}

function parseTab(tab: string | null): BoardTab {
  if (!tab) return "all";
  if ((BOARD_CATEGORIES as readonly string[]).includes(tab)) return tab as BoardTab;
  if (ID_RE.test(tab)) return `ask:${tab}`;
  return "all";
}

/** The search string for a state, keeping unrelated params. Defaults are left out. */
export function writeUrlState(current: string, state: UrlState): string {
  const params = new URLSearchParams(current);
  if (state.view === "board") params.delete("view");
  else params.set("view", state.view);
  const askId = askIdOf(state.activeTab);
  if (state.activeTab === "all") params.delete("tab");
  else params.set("tab", askId ?? state.activeTab);
  if (state.selectedPlaceId) params.set("place", state.selectedPlaceId);
  else params.delete("place");
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Same as the record form of searchParams the page receives. */
export function paramsFromRecord(record: Record<string, string | string[] | undefined>): ParamsLike {
  return {
    get(name) {
      const value = record[name];
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    },
  };
}
