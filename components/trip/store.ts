"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { TripPlaceCard, TripPlaceStatus, TripSnapshot } from "@/lib/contracts";

import type { BoardTab, MapCamera, PlacesMeta, TripView } from "./contracts";
import { initialState, reduce, type SlotWrite, type WorkspaceEvent, type WorkspaceState } from "./workspace/reducer";
import { writeUrlState } from "./workspace/url-state";

// The trip workspace store: TripWorkspaceState from contracts.ts plus actions.
// Every transition goes through the pure `reduce` in workspace/reducer.ts, so
// the store only adds React wiring, rollbacks and the URL mirror. One store
// per mounted workspace (a context, not a module singleton), so two requests
// on the server never share state.

export type Rollback = () => void;

export type TripStoreActions = {
  dispatch: (event: WorkspaceEvent) => void;
  applySnapshot: (snapshot: TripSnapshot) => void;
  /** Places streamed by a tool (preliminary or final). Merges by tripPlaceId, creates or updates the ask. */
  applyPlaces: (places: TripPlaceCard[], meta: PlacesMeta) => void;
  setHighlight: (tripPlaceId: string | null) => void;
  /** Opens (or closes, with null) the place profile; mirrored to ?place=. */
  select: (tripPlaceId: string | null) => void;
  setView: (view: TripView) => void;
  setTab: (tab: BoardTab) => void;
  setCamera: (camera: MapCamera | null) => void;
  /** Applies a slot write now; call the returned rollback if the server refuses it. */
  optimisticSlot: (write: SlotWrite | SlotWrite[]) => Rollback;
  optimisticStatus: (tripPlaceId: string, status: TripPlaceStatus) => Rollback;
  /** Hides an ask tab (archived); its places stay on the board. */
  removeAskTab: (askId: string) => Rollback;
  addDay: () => void;
  setSeedStatus: (status: TripSnapshot["trip"]["seedStatus"]) => void;
  setShareToken: (token: string) => void;
  toast: { message: string; id: number } | null;
  showToast: (message: string) => void;
  dismissToast: () => void;
};

export type TripStore = WorkspaceState & TripStoreActions;

type DataSlice = Pick<WorkspaceState, "places" | "slots" | "asks" | "activeTab" | "selectedPlaceId" | "highlightedPlaceId">;

export function createTripStore(initial: WorkspaceState): StoreApi<TripStore> {
  return createStore<TripStore>()((set, get) => {
    const dispatch = (event: WorkspaceEvent) => {
      const state = get();
      const next = reduce(state, event);
      if (next !== state) set(next);
    };

    // Captures the data a write touches and puts it back on rollback. Later
    // unrelated changes (a streamed place, a new ask) are kept.
    const checkpoint = (): Rollback => {
      const before: DataSlice = get();
      const saved: DataSlice = {
        places: before.places,
        slots: before.slots,
        asks: before.asks,
        activeTab: before.activeTab,
        selectedPlaceId: before.selectedPlaceId,
        highlightedPlaceId: before.highlightedPlaceId,
      };
      return () => {
        const now = get();
        const places = { ...now.places };
        for (const [id, card] of Object.entries(saved.places)) places[id] = { ...(places[id] ?? card), status: card.status, askIds: card.askIds };
        set({ places, slots: saved.slots, asks: { ...now.asks, ...saved.asks }, activeTab: saved.activeTab });
      };
    };

    let toastId = 0;

    return {
      ...initial,
      dispatch,
      applySnapshot: (snapshot) => dispatch({ type: "snapshot", snapshot }),
      applyPlaces: (places, meta) => dispatch({ type: "places", places, meta }),
      setHighlight: (tripPlaceId) => dispatch({ type: "highlight", tripPlaceId }),
      select: (tripPlaceId) => dispatch({ type: "select", tripPlaceId }),
      setView: (view) => dispatch({ type: "view", view }),
      setTab: (tab) => dispatch({ type: "tab", tab }),
      setCamera: (camera) => dispatch({ type: "camera", camera }),
      optimisticSlot: (write) => {
        const rollback = checkpoint();
        for (const w of Array.isArray(write) ? write : [write]) dispatch({ type: "slot", write: w });
        return rollback;
      },
      optimisticStatus: (tripPlaceId, status) => {
        const rollback = checkpoint();
        dispatch({ type: "status", tripPlaceId, status });
        return rollback;
      },
      removeAskTab: (askId) => {
        const rollback = checkpoint();
        dispatch({ type: "archiveAsk", askId });
        return rollback;
      },
      addDay: () => dispatch({ type: "addDay" }),
      setSeedStatus: (seedStatus) => dispatch({ type: "trip", patch: { seedStatus } }),
      setShareToken: (shareToken) => dispatch({ type: "trip", patch: { shareToken } }),
      toast: null,
      showToast: (message) => set({ toast: { message, id: ++toastId } }),
      dismissToast: () => set({ toast: null }),
    };
  });
}

const TripStoreContext = createContext<StoreApi<TripStore> | null>(null);

/** Mirrors view, tab and the open place to the URL (replaceState, no navigation). */
function useUrlMirror(store: StoreApi<TripStore>) {
  useEffect(() => {
    let last = "";
    const write = (state: TripStore) => {
      const search = writeUrlState(window.location.search, {
        view: state.view,
        activeTab: state.activeTab,
        selectedPlaceId: state.selectedPlaceId,
      });
      if (search === last) return;
      last = search;
      if (search !== window.location.search) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
      }
    };
    write(store.getState());
    return store.subscribe(write);
  }, [store]);
}

export function TripStoreProvider({
  snapshot,
  url,
  children,
}: {
  snapshot: TripSnapshot;
  url: Pick<WorkspaceState, "view" | "activeTab" | "selectedPlaceId">;
  children: ReactNode;
}) {
  const [store] = useState(() => createTripStore(initialState(snapshot, url)));
  useUrlMirror(store);
  return createElement(TripStoreContext.Provider, { value: store }, children);
}

export function useTripStoreApi(): StoreApi<TripStore> {
  const store = useContext(TripStoreContext);
  if (!store) throw new Error("useTripStore must be used inside TripStoreProvider");
  return store;
}

export function useTripStore<T>(selector: (state: TripStore) => T): T {
  return useStore(useTripStoreApi(), selector);
}
