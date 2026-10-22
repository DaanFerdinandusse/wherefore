"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { createAutosaver, type Autosaver, type SaveResult, type SaveStatus } from "../autosave";

// The autosaver bound to a component: created on first use, always calling
// the latest `save`, flushed when the component unmounts (a navigation never
// drops the last keystrokes). Its methods are stable, for event handlers.
export function useAutosave<P extends object>(
  save: (patch: Partial<P>) => Promise<SaveResult>,
  { delayMs, onStatus }: { delayMs: number; onStatus?: (status: SaveStatus) => void },
): Autosaver<P> {
  const saveRef = useRef(save);
  const statusRef = useRef(onStatus);
  const saverRef = useRef<Autosaver<P> | null>(null);
  useEffect(() => {
    saveRef.current = save;
    statusRef.current = onStatus;
  });

  const get = useCallback((): Autosaver<P> => {
    saverRef.current ??= createAutosaver<P>({
      delayMs,
      save: (patch) => saveRef.current(patch),
      onStatus: (status) => statusRef.current?.(status),
    });
    return saverRef.current;
  }, [delayMs]);

  useEffect(
    () => () => {
      void saverRef.current?.flush();
    },
    [],
  );

  const schedule = useCallback<Autosaver<P>["schedule"]>((patch, options) => get().schedule(patch, options), [get]);
  const flush = useCallback(() => get().flush(), [get]);
  const cancel = useCallback(() => get().cancel(), [get]);
  const busy = useCallback(() => get().busy(), [get]);
  return useMemo(() => ({ schedule, flush, cancel, busy }), [schedule, flush, cancel, busy]);
}
