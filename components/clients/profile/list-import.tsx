"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FavoriteTile } from "@/lib/clients/candidates";

import { plural } from "../format";
import { takeListImport } from "../held-list-import";
import { ListLinkField } from "../list-link-field";
import { useListImport, type ListImportState } from "./use-list-import";

// "Import a Google Maps list": paste the link a client shared, and every place
// that matches exactly joins their favorites while the count runs. Nothing to
// review: a place without an exact match is left out, and the summary says how
// many.

function summary(state: Extract<ListImportState, { step: "done" }>): string {
  const missed = state.total - state.matched - state.failed;
  const known = state.matched - state.added;
  return [
    state.added > 0 ? `Added ${plural(state.added, "place")} from ${state.title}.` : `No new places from ${state.title}.`,
    known > 0 ? `${plural(known, "place")} already saved.` : null,
    missed > 0 ? `${plural(missed, "place")} had no match and ${missed === 1 ? "was" : "were"} left out.` : null,
    state.failed > 0 ? `${plural(state.failed, "place")} could not be checked. Import the list again to add ${state.failed === 1 ? "it" : "them"}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function ListImport({
  clientId,
  onAdded,
  onFinished,
}: {
  clientId: string;
  onAdded: (tiles: FavoriteTile[]) => void;
  onFinished: () => void;
}) {
  const { state, start, dismiss } = useListImport({ clientId, onAdded, onFinished });
  const [open, setOpen] = useState(false);

  // A link pasted on the new client screen, which had no client to import into yet.
  const startHeld = useEffectEvent(() => {
    const link = takeListImport(clientId);
    if (link) start(link);
  });
  useEffect(() => startHeld(), []);

  function reset() {
    dismiss();
    setOpen(false);
  }

  if (state.step === "reading" || state.step === "importing") {
    const percent = state.step === "importing" && state.total > 0 ? Math.round((state.checked / state.total) * 100) : 0;
    return (
      <div role="status" className="flex flex-col gap-2 rounded-card bg-surface-raised px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-ui">
          <span className="flex min-w-0 items-center gap-2 text-ink">
            <Spinner size={14} label="Importing" />
            <span className="truncate">{state.step === "reading" ? "Reading the list" : `Importing ${state.title}`}</span>
          </span>
          {state.step === "importing" ? (
            <span className="shrink-0 text-text-2 tabular-nums">
              {state.checked} of {state.total} checked · {state.matched} matched
            </span>
          ) : null}
        </div>
        <div
          role="progressbar"
          aria-label="Import progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1 overflow-hidden rounded-pill bg-avatar"
        >
          <div className="h-full rounded-pill bg-ink transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  if (state.step === "done") {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-raised px-4 py-3">
        <p className="min-w-0 text-ui text-ink">{summary(state)}</p>
        <Button variant="ghost" size="sm" onClick={reset}>
          Done
        </Button>
      </div>
    );
  }

  if (!open && state.step === "idle") {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <MapPin size={14} aria-hidden />
          Import a Google Maps list
        </Button>
      </div>
    );
  }

  return <ListLinkField autoFocus onSubmit={start} onCancel={reset} message={state.step === "failed" ? state.message : undefined} />;
}
