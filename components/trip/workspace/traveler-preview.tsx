"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import type { SharedTripView } from "@/lib/contracts";

import { TravelerView } from "../traveler-view";

// Traveler view: the page /s/[token] renders, full screen over the workspace,
// so the advisor sees exactly what the traveler sees, link or no link. Each
// open reads the view fresh; the page behind stays mounted, so a running chat
// turn keeps streaming. Closing is the only thing to do here: the button or Esc.

type PreviewProps = {
  tripId: string;
  /** Shown when the read fails: the same page from the snapshot, with one photo per place. */
  fallback: SharedTripView | null;
  onClose: () => void;
};

export function TravelerPreview({ open, ...props }: PreviewProps & { open: boolean }) {
  return (
    <Sheet open={open} onClose={props.onClose} label="Traveler view" side="full">
      <Preview {...props} />
    </Sheet>
  );
}

function Preview({ tripId, fallback, onClose }: PreviewProps) {
  const [read, setRead] = useState<SharedTripView | null>(null);
  const [failed, setFailed] = useState(false);
  const view = read ?? (failed ? fallback : null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/trips/${tripId}/traveler-view`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Traveler view read failed: ${res.status}`);
        return res.json() as Promise<{ view: SharedTripView }>;
      })
      .then((body) => setRead(body.view))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [tripId]);

  return (
    <>
      {/* Clear of the dates at the top of the page: beside them when wide, below them when narrow. */}
      <div className="sticky top-[72px] z-10 flex h-0 justify-end pr-4 lg:top-2.5">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 items-center gap-2 rounded-pill bg-ink pr-3.5 pl-2.5 text-ui font-semibold text-surface shadow-card transition-colors hover:bg-text-4"
        >
          <X size={16} strokeWidth={2.2} aria-hidden />
          Close traveler view
        </button>
      </div>
      {view ? (
        <TravelerView view={view} />
      ) : (
        <div className="flex h-dvh items-center justify-center text-text-muted">
          <Spinner size={22} label="Loading the traveler view" />
        </div>
      )}
    </>
  );
}
