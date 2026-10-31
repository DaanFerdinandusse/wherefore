"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FavoriteTile } from "@/lib/clients/candidates";

import { takeListImport } from "../held-list-import";
import { ListLinkField } from "../list-link-field";
import { useListImport } from "./use-list-import";

// "Import a Google Maps list": paste the link a client shared, and the places
// that match exactly join their favorites while the bar fills. Nothing to review,
// and no tally: the places appearing are the result.

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
    const percent = state.step === "importing" ? state.percent : 0;
    return (
      <div role="status" className="flex flex-col gap-2 rounded-card bg-surface-raised px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 text-ui text-ink">
          <Spinner size={14} label="Importing" />
          <span className="truncate">{state.step === "reading" ? "Reading the list" : `Importing ${state.title}`}</span>
        </span>
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

  return (
    <ListLinkField
      autoFocus
      onSubmit={(link) => {
        setOpen(false);
        start(link);
      }}
      onCancel={reset}
      message={state.step === "failed" ? state.message : undefined}
    />
  );
}
