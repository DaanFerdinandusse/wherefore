"use client";

import { useCallback, useState } from "react";

import type { SaveResult, SaveStatus } from "../autosave";

// One save state for the whole profile, from many sources (the name and home
// city, notes, favorites, rules). Each source reports its own status; the
// header shows the first error, else "Saving" while anything is in flight,
// else "Saved" once something has saved.

export type ProfileSaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function combineStatuses(statuses: readonly SaveStatus[]): ProfileSaveState {
  const error = statuses.find((s) => s.kind === "error");
  if (error && error.kind === "error") return { kind: "error", message: error.message };
  if (statuses.some((s) => s.kind === "saving" || s.kind === "pending")) return { kind: "saving" };
  if (statuses.some((s) => s.kind === "saved")) return { kind: "saved" };
  return { kind: "idle" };
}

export type Report = (source: string, status: SaveStatus) => void;
export type RunOp = (source: string, work: () => Promise<SaveResult>) => Promise<boolean>;

export function useSaveTracker(): { state: ProfileSaveState; report: Report; runOp: RunOp } {
  const [bySource, setBySource] = useState<Record<string, SaveStatus>>({});

  const report = useCallback<Report>((source, status) => {
    setBySource((current) => ({ ...current, [source]: status }));
  }, []);

  /** Runs a one-off save (add a favorite, remove a rule) and reports it. True when it saved. */
  const runOp = useCallback<RunOp>(
    async (source, work) => {
      report(source, { kind: "saving" });
      let result: SaveResult;
      try {
        result = await work();
      } catch {
        result = { ok: false, error: "Could not save. Check your connection and try again." };
      }
      report(source, result.ok ? { kind: "saved" } : { kind: "error", message: result.error });
      return result.ok;
    },
    [report],
  );

  return { state: combineStatuses(Object.values(bySource)), report, runOp };
}
