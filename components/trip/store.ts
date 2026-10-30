"use client";

import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { TripPlaceCard, TripPlaceStatus, TripSnapshot } from "@/lib/contracts";

import type { BoardTab, MapCamera, PlacesMeta, TripView } from "./contracts";
import { applyOptimistic, applyRemote, commitPatch, revertPatch, type Patch } from "./workspace/patches";
import { initialState, type SlotWrite, type WorkspaceEvent, type WorkspaceState } from "./workspace/reducer";
import { historyMode, readUrlState, writeUrlState, type UrlState } from "./workspace/url-state";

// The trip workspace store: TripWorkspaceState from contracts.ts plus actions.
// Every transition goes through the pure `reduce` in workspace/reducer.ts;
// optimistic writes go through workspace/patches.ts, which records the exact
// inverse of each write, so a rollback reverts only what that write changed
// and never a later change. One store per mounted workspace (a context, not a
// module singleton), so two requests on the server never share state.

/** An optimistic write in flight: roll it back when the server refuses it, commit it when it lands. */
export type Optimistic = { rollback: () => void; commit: () => void };

export type TripStoreActions = {
  /** A change that is not optimistic (a server answer, a view change). */
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
  /** Applies events now as one write; roll it back if the server refuses it, commit it when it lands. */
  optimistic: (events: WorkspaceEvent[]) => Optimistic;
  optimisticSlot: (write: SlotWrite | SlotWrite[]) => Optimistic;
  optimisticStatus: (tripPlaceId: string, status: TripPlaceStatus) => Optimistic;
  /** Hides an ask tab (archived); its places stay on the board. */
  removeAskTab: (askId: string) => Optimistic;
  addDay: () => void;
  setSeedStatus: (status: TripSnapshot["trip"]["seedStatus"]) => void;
  /** The trip's share token, or null once sharing stopped. */
  setShareToken: (token: string | null) => void;
  toast: { message: string; id: number } | null;
  showToast: (message: string) => void;
  dismissToast: () => void;
  /** A prompt from outside the chat (the map's "Search this region"). The chat sends it as soon as it is free. */
  chatPrompt: { text: string; id: number } | null;
  askChat: (text: string) => void;
  clearChatPrompt: () => void;
};

export type TripStore = WorkspaceState & TripStoreActions;

export function createTripStore(initial: WorkspaceState): StoreApi<TripStore> {
  return createStore<TripStore>()((set, get) => {
    // The patches of optimistic writes still waiting for the server.
    let pending: Patch[] = [];

    const dispatch = (event: WorkspaceEvent) => {
      const state = get();
      const next = applyRemote(state, event);
      if (next !== state) set(next);
    };

    const optimistic = (events: WorkspaceEvent[]): Optimistic => {
      const { state, patch } = applyOptimistic(get(), events);
      set(state);
      pending = [...pending, patch];
      let settled = false;
      return {
        rollback: () => {
          if (settled) return;
          settled = true;
          const result = revertPatch(get(), patch, pending);
          pending = result.pending;
          set(result.state);
        },
        commit: () => {
          if (settled) return;
          settled = true;
          pending = commitPatch(pending, patch);
        },
      };
    };

    let toastId = 0;
    let chatPromptId = 0;

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
      optimistic,
      optimisticSlot: (write) => optimistic((Array.isArray(write) ? write : [write]).map((w) => ({ type: "slot", write: w }))),
      optimisticStatus: (tripPlaceId, status) => optimistic([{ type: "status", tripPlaceId, status }]),
      removeAskTab: (askId) => optimistic([{ type: "archiveAsk", askId }]),
      addDay: () => dispatch({ type: "addDay" }),
      setSeedStatus: (seedStatus) => dispatch({ type: "trip", patch: { seedStatus } }),
      setShareToken: (shareToken) => dispatch({ type: "trip", patch: { shareToken: shareToken ?? undefined } }),
      toast: null,
      showToast: (message) => set({ toast: { message, id: ++toastId } }),
      dismissToast: () => set({ toast: null }),
      chatPrompt: null,
      askChat: (text) => set({ chatPrompt: { text, id: ++chatPromptId } }),
      clearChatPrompt: () => set({ chatPrompt: null }),
    };
  });
}

const TripStoreContext = createContext<StoreApi<TripStore> | null>(null);

const CAMERA_WRITE_MS = 400;

function urlStateOf(state: TripStore): UrlState {
  return { view: state.view, activeTab: state.activeTab, selectedPlaceId: state.selectedPlaceId, camera: state.camera };
}

/**
 * Mirrors view, tab, the open place and the map camera to the URL, both
 * ways. A view or place change adds a history entry (Back undoes it); a tab
 * or camera change replaces the current one. Back, Forward and Next
 * navigations to the same page read the URL back into the store.
 */
function useUrlMirror(store: StoreApi<TripStore>) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  // True while the URL is being read into the store: what follows from it
  // only tidies the current entry, it never adds one.
  const applying = useRef(false);

  // Store to URL.
  useEffect(() => {
    let previous = urlStateOf(store.getState());
    let cameraTimer: number | undefined;
    const write = (state: TripStore, mode: "pushState" | "replaceState") => {
      const next = writeUrlState(window.location.search, urlStateOf(state));
      if (next === window.location.search) return;
      window.history[mode](null, "", `${window.location.pathname}${next}${window.location.hash}`);
    };
    write(store.getState(), "replaceState");
    const unsubscribe = store.subscribe((state) => {
      const current = urlStateOf(state);
      const mode = historyMode(previous, current);
      previous = current;
      if (!mode) return;
      window.clearTimeout(cameraTimer);
      if (applying.current) return write(state, "replaceState");
      if (mode === "camera") cameraTimer = window.setTimeout(() => write(store.getState(), "replaceState"), CAMERA_WRITE_MS);
      else write(state, mode);
    });
    return () => {
      window.clearTimeout(cameraTimer);
      unsubscribe();
    };
  }, [store]);

  // URL to store: Back and Forward (with the camera of that entry).
  useEffect(() => {
    const onPopState = () => applyUrlState(store, applying, readUrlState(new URLSearchParams(window.location.search)), true);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [store]);

  // URL to store: a Next navigation to this page with other params (a link
  // with ?place=). Our own history writes land here too and change nothing.
  useEffect(() => {
    applyUrlState(store, applying, readUrlState(new URLSearchParams(search)), false);
  }, [store, search]);
}

function applyUrlState(store: StoreApi<TripStore>, applying: RefObject<boolean>, url: UrlState, withCamera: boolean) {
  const state = store.getState();
  applying.current = true;
  try {
    if (state.view !== url.view) state.setView(url.view);
    if (state.activeTab !== url.activeTab) state.setTab(url.activeTab);
    if (state.selectedPlaceId !== url.selectedPlaceId) {
      state.select(url.selectedPlaceId && state.places[url.selectedPlaceId] ? url.selectedPlaceId : null);
    }
    if (withCamera && url.camera) state.setCamera(url.camera);
  } finally {
    applying.current = false;
  }
}

export function TripStoreProvider({
  snapshot,
  url,
  children,
}: {
  snapshot: TripSnapshot;
  url: UrlState;
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
