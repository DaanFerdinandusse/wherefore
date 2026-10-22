// The per-tab client state mirrored to the URL for deep links and the back
// button: ?view=map&tab=<askId|category>&place=<tripPlaceId>&cam=<lat,lon,zoom>.
// Pure parsing and formatting; the store writes it with history.pushState
// (view and place) or history.replaceState (tab and camera), see historyMode.

import type { BoardTab, MapCamera, TripView } from "../contracts";

import { askIdOf, BOARD_CATEGORIES } from "./reducer";

export type UrlState = { view: TripView; activeTab: BoardTab; selectedPlaceId: string | null; camera: MapCamera | null };

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
    camera: parseCamera(params.get("cam")),
  };
}

function parseCamera(value: string | null): MapCamera | null {
  if (!value) return null;
  const [lat, lon, zoom] = value.split(",").map(Number);
  if (![lat, lon, zoom].every(Number.isFinite)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || zoom < 0 || zoom > 22) return null;
  return { lat, lon, zoom };
}

function formatCamera(camera: MapCamera): string {
  return [camera.lat.toFixed(5), camera.lon.toFixed(5), camera.zoom.toFixed(2)].map((n) => String(Number(n))).join(",");
}

/**
 * How a change reaches the history: a new view or another open place is a
 * step Back can undo (push); a tab or the camera only rewrites the current
 * entry (replace; the camera debounced). Null when nothing in the URL moves.
 */
export function historyMode(before: UrlState, after: UrlState): "pushState" | "replaceState" | "camera" | null {
  if (before.view !== after.view || before.selectedPlaceId !== after.selectedPlaceId) return "pushState";
  if (before.activeTab !== after.activeTab) return "replaceState";
  if (before.camera !== after.camera) return "camera";
  return null;
}

function parseTab(tab: string | null): BoardTab {
  if (!tab) return "all";
  if ((BOARD_CATEGORIES as readonly string[]).includes(tab)) return tab as BoardTab;
  if (ID_RE.test(tab)) return `ask:${tab}`;
  return "all";
}

/** The search string for a state, keeping unrelated params. Defaults are left out. */
export function writeUrlState(current: string, state: Omit<UrlState, "camera"> & { camera?: MapCamera | null }): string {
  const params = new URLSearchParams(current);
  if (state.view === "board") params.delete("view");
  else params.set("view", state.view);
  const askId = askIdOf(state.activeTab);
  if (state.activeTab === "all") params.delete("tab");
  else params.set("tab", askId ?? state.activeTab);
  if (state.selectedPlaceId) params.set("place", state.selectedPlaceId);
  else params.delete("place");
  if (state.camera) params.set("cam", formatCamera(state.camera));
  else params.delete("cam");
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
