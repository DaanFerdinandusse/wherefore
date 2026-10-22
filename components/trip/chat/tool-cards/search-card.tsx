"use client";

import { useState } from "react";

import type { FindPlacesOutput, ToolStep } from "@/lib/contracts";
import { loosenedCopy, searchTitle, seconds } from "@/lib/agent/tools/labels";

import { CardFrame, CardHeader, ErrorRow, PlaceTile, StepIcon, type PlaceHandlers } from "./parts";

// The search card for find_places and seed_trip (F7, F7b): a warm thumbnail
// with the destination, the title ("Searched natural wine bars"), the details
// line, "12 found · 1.4 s", 150 px photo tiles with a "+N" tile, then the
// steps "Score your places" and "Explain picks" with their counts. Renders
// every phase from the tool part itself, so after a reload the final state
// looks the same.

const VISIBLE_TILES = 4;

type Props = PlaceHandlers & {
  tool: "find_places" | "seed_trip";
  state: string;
  preliminary: boolean;
  /** The tool input, for the title while nothing came back yet. */
  input?: { intent?: string; day_hint?: string };
  output?: FindPlacesOutput;
  /** The destination name, for the thumbnail. */
  destination?: string;
  errorText?: string;
  onRetry?: () => void;
};

function Thumbnail({ destination }: { destination?: string }) {
  return (
    <div
      aria-hidden
      className="flex h-13 w-18 shrink-0 items-end overflow-hidden rounded-[10px] border border-rule-strong bg-avatar p-1.5"
    >
      <span className="truncate font-display text-ui-sm text-text-3">{destination ?? ""}</span>
    </div>
  );
}

function StepRow({ step }: { step: ToolStep }) {
  return (
    <div className="flex items-center gap-3 py-1.5" data-testid={`tool-step-${step.key}`} data-step-state={step.state}>
      <StepIcon state={step.state} label={step.label} />
      <p className="w-33 shrink-0 text-ui-sm font-semibold text-ink">{step.label}</p>
      <p className="min-w-0 grow truncate text-ui-sm text-text-4">{step.detail ?? ""}</p>
      {step.note ? <p className="shrink-0 text-ui-sm font-medium text-ink">{step.note}</p> : null}
    </div>
  );
}

/** "14 found · 3.2 s": the live count while running, the final count and time once done. */
function figureFor(output: FindPlacesOutput | undefined, running: boolean): string | undefined {
  if (!output) return undefined;
  if (running && output.count === 0) return undefined;
  return `${output.count} found · ${seconds(output.elapsedMs)}`;
}

/**
 * The search stage's own figure ("Search: 12 found · 1.4 s") once the tool is
 * done, when it differs from the final one (your places joined the ask, or
 * the total time includes scoring and explaining).
 */
function searchStageLine(output: FindPlacesOutput | undefined, running: boolean): string | undefined {
  const note = output?.steps?.find((s) => s.key === "search")?.note;
  if (running || !note || !output) return undefined;
  return note === figureFor(output, false) ? undefined : `Search: ${note}`;
}

export function SearchCard({ tool, state, preliminary, input, output, destination, errorText, onRetry, ...handlers }: Props) {
  const [expanded, setExpanded] = useState(false);
  const failed = state === "output-error" || Boolean(output?.error && output.phase === "done" && output.places.length === 0);
  const running = !failed && (state !== "output-available" || preliminary);
  const places = output?.places ?? [];
  const shown = expanded ? places : places.slice(0, VISIBLE_TILES);
  const hidden = places.length - shown.length;

  const title =
    output?.title ??
    (tool === "seed_trip"
      ? running
        ? "Building the first list"
        : "Built the first list"
      : searchTitle(input?.intent ?? "places", running, input?.day_hint));
  const details = running && output?.progress ? output.progress : output?.details;
  const extraSteps = (output?.steps ?? []).filter((s) => s.key !== "search");
  const stageLine = failed ? undefined : searchStageLine(output, running);
  const notes = [...loosenedCopy(output?.loosened ?? []), ...(!running && output?.progress ? [output.progress] : [])];

  return (
    <CardFrame tool={tool} state={state} preliminary={preliminary}>
      <CardHeader
        state={failed ? "failed" : running ? "running" : "done"}
        leading={<Thumbnail destination={destination} />}
        title={title}
        details={details}
        figure={figureFor(output, running)}
      />

      {stageLine ? (
        <p className="pl-8 text-meta text-text-2" data-testid="search-stage-line">
          {stageLine}
        </p>
      ) : null}

      {places.length > 0 ? (
        <ul
          className="flex gap-2.5 overflow-x-auto pb-1 pl-8"
          data-testid="search-tiles"
          onMouseLeave={() => handlers.onPlacesHover?.(null)}
        >
          {shown.map((place) => (
            <PlaceTile key={place.tripPlaceId} place={place} {...handlers} />
          ))}
          {hidden > 0 ? (
            <li className="w-24 shrink-0">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="flex h-[92px] w-full flex-col items-center justify-center gap-0.5 rounded-xl border border-pill-outline/70 text-ink hover:bg-surface"
                aria-label={`Show ${hidden} more places`}
              >
                <span className="font-display text-card-sm">+{hidden}</span>
                <span className="text-meta font-medium text-text-2">more</span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : running ? (
        <p className="pl-8 text-ui-sm text-text-2">Places land here and on the board as they come in.</p>
      ) : null}

      {extraSteps.length > 0 && !failed ? (
        <div className="flex flex-col">
          {extraSteps.map((step) => (
            <StepRow key={step.key} step={step} />
          ))}
        </div>
      ) : null}

      {notes.length > 0 ? (
        <ul className="flex flex-col gap-0.5 pl-8">
          {notes.map((note) => (
            <li key={note} className="text-meta text-text-2">
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      {failed ? (
        <ErrorRow message={output?.error ?? errorText ?? "The search did not finish."} onRetry={onRetry} />
      ) : null}
    </CardFrame>
  );
}
