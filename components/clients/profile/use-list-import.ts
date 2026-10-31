"use client";

import { useEffect, useRef, useState } from "react";

import { importListPlacesAction, readSharedListAction } from "@/lib/clients/actions";
import type { FavoriteTile } from "@/lib/clients/candidates";
import { LIST_IMPORT_BATCH } from "@/lib/clients/list-import";

// Importing a shared Google Maps list into the profile: read the list once,
// then save it batch by batch, one server action at a time, so the count moves
// while it runs and a long list never sits in one request.

export type ListImportState =
  | { step: "idle" }
  | { step: "reading" }
  | { step: "importing"; title: string; total: number; checked: number; matched: number }
  | { step: "done"; title: string; total: number; matched: number; added: number }
  | { step: "failed"; message: string };

export function useListImport({
  clientId,
  onAdded,
  onFinished,
}: {
  clientId: string;
  onAdded: (tiles: FavoriteTile[]) => void;
  /** Runs once after an import that added places: the taste tags follow them. */
  onFinished: () => void;
}) {
  const [state, setState] = useState<ListImportState>({ step: "idle" });
  const left = useRef(false);

  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
    };
  }, []);

  async function run(link: string) {
    setState({ step: "reading" });
    const list = await readSharedListAction(link).catch(() => null);
    if (left.current) return;
    if (!list?.ok) {
      setState({ step: "failed", message: list?.error ?? "Could not reach the server. Check your connection and try again." });
      return;
    }
    const { title, places } = list.data;
    const total = places.length;
    let checked = 0;
    let matched = 0;
    let added = 0;
    setState({ step: "importing", title, total, checked, matched });

    for (let start = 0; start < total; start += LIST_IMPORT_BATCH) {
      const batch = places.slice(start, start + LIST_IMPORT_BATCH);
      // A saved place is matched on a retry without being added twice.
      const result =
        (await importListPlacesAction(clientId, batch).catch(() => null)) ??
        (await importListPlacesAction(clientId, batch).catch(() => null));
      if (left.current) return;
      if (!result?.ok) {
        if (added > 0) onFinished();
        const saved = added > 0 ? ` ${added} ${added === 1 ? "place was" : "places were"} saved. Import the list again to add the rest.` : "";
        setState({ step: "failed", message: `${result?.error ?? "The import stopped."}${saved}` });
        return;
      }
      checked += batch.length;
      matched += result.data.matched;
      added += result.data.added.length;
      if (result.data.added.length > 0) onAdded(result.data.added);
      setState({ step: "importing", title, total, checked, matched });
    }

    if (added > 0) onFinished();
    setState({ step: "done", title, total, matched, added });
  }

  return {
    state,
    start: (link: string) => void run(link),
    dismiss: () => setState({ step: "idle" }),
  };
}
