"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { listTripCallsAction, type TripCallRow } from "@/lib/trips/workspace-actions";

// "How we got this": every recommendation call made for this trip, oldest
// first, with its key parameters, result count, time and any filter that was
// loosened to get enough results. Read from the trip call log when opened.

function paramText(value: unknown): string {
  if (Array.isArray(value)) return value.length > 3 ? `${value.slice(0, 3).join(", ")} +${value.length - 3}` : value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** The few parameters that explain a call, shortest first. */
export function keyParams(params: Record<string, unknown>): { key: string; value: string }[] {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({ key: key.replace(/^(filter|signal)\./, ""), value: paramText(value) }))
    .slice(0, 6);
}

function sourceLabel(source: string): string {
  if (source === "seed") return "First list";
  if (source.startsWith("ask")) return "Your ask";
  if (source === "profile") return "Place profile";
  return "Manual";
}

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: TripCallRow[] };

export function HowWeGotThis({ tripId, open, onClose }: { tripId: string; open: boolean; onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listTripCallsAction(tripId).then((result) => {
      if (cancelled) return;
      setLoad(result.ok ? { status: "ready", rows: result.data } : { status: "error", message: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [open, tripId]);

  return (
    <Sheet open={open} onClose={onClose} label="How we got this" side="right" className="w-[min(600px,calc(100vw-32px))]! p-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-section text-ink">How we got this</h2>
            <p className="text-body text-text-2">Every search made for this trip, in order.</p>
          </div>
          <IconButton label="Close" variant="soft" icon={<X size={16} strokeWidth={2} />} onClick={onClose} />
        </div>

        <p className="rounded-row bg-surface-raised p-4 text-ui leading-5 text-text-3">
          Match scores are ranks within each search, not raw numbers. The raw values sit very close together (most fall
          between 0.79 and 0.80), so the best result in a set shows 94 and the others count down from there. A score
          compares places within one search, not across searches.
        </p>

        {load.status === "loading" ? (
          <p className="flex items-center gap-2 text-ui text-text-2">
            <Spinner size={14} /> Loading the searches
          </p>
        ) : load.status === "error" ? (
          <p className="text-ui text-amber">{load.message}</p>
        ) : load.rows.length === 0 ? (
          <p className="text-ui text-text-2">No searches yet. The first list and every ask in the chat show up here.</p>
        ) : (
          <ol className="flex flex-col">
            {load.rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 border-t border-rule py-4 first:border-t-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-ui-sm text-ink">{row.endpoint}</span>
                  <span className="shrink-0 text-ui-sm text-text-muted">
                    {row.count} {row.count === 1 ? "result" : "results"} · {(row.ms / 1000).toFixed(1)} s
                  </span>
                </div>
                <p className="label-caps text-text-2">{sourceLabel(row.source)}</p>
                {keyParams(row.params).length > 0 ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ui-sm">
                    {keyParams(row.params).map((p) => (
                      <div key={p.key} className="contents">
                        <dt className="text-text-muted">{p.key}</dt>
                        <dd className="min-w-0 truncate text-text-3" title={p.value}>
                          {p.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {row.loosened.length > 0 ? (
                  <p className="text-ui-sm text-amber">Loosened to find enough places: {row.loosened.join(", ")}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Sheet>
  );
}
