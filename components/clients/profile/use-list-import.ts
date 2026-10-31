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
  | { step: "importing"; title: string; percent: number }
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
    let added = false;
    setState({ step: "importing", title, percent: 0 });

    for (let start = 0; start < total; start += LIST_IMPORT_BATCH) {
      const batch = places.slice(start, start + LIST_IMPORT_BATCH);
      // A saved place is not added twice on a retry.
      const result =
        (await importListPlacesAction(clientId, batch).catch(() => null)) ??
        (await importListPlacesAction(clientId, batch).catch(() => null));
      if (left.current) return;
      if (!result?.ok) {
        if (added) onFinished();
        setState({ step: "failed", message: `${result?.error ?? "The import stopped."} Import the list again to pick up the rest.` });
        return;
      }
      if (result.data.added.length > 0) {
        added = true;
        onAdded(result.data.added);
      }
      setState({ step: "importing", title, percent: Math.round(((start + batch.length) / total) * 100) });
    }

    if (added) onFinished();
    setState({ step: "idle" });
  }

  return {
    state,
    start: (link: string) => void run(link),
    dismiss: () => setState({ step: "idle" }),
  };
}
