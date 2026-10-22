"use client";

import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Toast, ToastAction } from "@/components/ui/toast";
import type { TasteTag } from "@/lib/contracts";
import { refreshTasteAction } from "@/lib/places/actions";

// Shared client state for the My places screen: the one toast (with an
// optional Undo) and the advisor's taste tags. Saves and removals call
// `tasteChanged()`; the portrait is recomputed once things settle, so three
// quick saves cost one provider call.

export const TASTE_REFRESH_DELAY_MS = 2500;
const TOAST_MS = 5000;
const TOAST_WITH_UNDO_MS = 8000;

type ToastState = { id: number; message: string; undo?: () => void };

type PlacesContextValue = {
  notify: (message: string, undo?: () => void) => void;
  tasteChanged: () => void;
  refreshTaste: () => void;
  taste: { tags: TasteTag[]; refreshing: boolean; error: string | null };
};

const PlacesContext = createContext<PlacesContextValue | null>(null);

export function usePlaces(): PlacesContextValue {
  const value = use(PlacesContext);
  if (!value) throw new Error("usePlaces must be used inside <PlacesProvider>.");
  return value;
}

export function PlacesProvider({ initialTasteTags, children }: { initialTasteTags: TasteTag[]; children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tags, setTags] = useState<TasteTag[]>(initialTasteTags);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tasteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (tasteTimer.current) clearTimeout(tasteTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const notify = useCallback((message: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ id, message, undo });
    toastTimer.current = setTimeout(
      () => setToast((current) => (current?.id === id ? null : current)),
      undo ? TOAST_WITH_UNDO_MS : TOAST_MS,
    );
  }, []);

  const refreshTaste = useCallback(async () => {
    if (tasteTimer.current) clearTimeout(tasteTimer.current);
    tasteTimer.current = null;
    setRefreshing(true);
    setError(null);
    const result = await refreshTasteAction();
    setRefreshing(false);
    if (result.ok) setTags(result.tags);
    else setError(result.error);
  }, []);

  const tasteChanged = useCallback(() => {
    if (tasteTimer.current) clearTimeout(tasteTimer.current);
    tasteTimer.current = setTimeout(() => void refreshTaste(), TASTE_REFRESH_DELAY_MS);
  }, [refreshTaste]);

  const value: PlacesContextValue = {
    notify,
    tasteChanged,
    refreshTaste: () => void refreshTaste(),
    taste: { tags, refreshing, error },
  };

  return (
    <PlacesContext value={value}>
      {children}
      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          action={
            toast.undo ? (
              <ToastAction
                onClick={() => {
                  const undo = toast.undo;
                  setToast(null);
                  undo?.();
                }}
              >
                Undo
              </ToastAction>
            ) : undefined
          }
        />
      ) : null}
    </PlacesContext>
  );
}
