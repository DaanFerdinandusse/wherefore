"use client";

import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai";
import { Check, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";

import type { FindPlacesOutput } from "@/lib/contracts";

import { readPlacesOutput } from "./chat-places";

// Generic tool card: one frame for every tool, branching on part.state, with
// a body per tool name only where the output earns one (places tiles). The
// board agent restyles these later; keep them plain.

export type ToolPart = ToolUIPart | DynamicToolUIPart;

const LABELS: Record<string, { running: string; done: string }> = {
  get_trip_context: { running: "Reading the trip", done: "Read the trip" },
  echo_places: { running: "Searching test places", done: "Searched test places" },
  slow_count: { running: "Counting", done: "Counted" },
  find_places: { running: "Searching places", done: "Searched places" },
};

function label(name: string, done: boolean): string {
  const known = LABELS[name];
  if (known) return done ? known.done : known.running;
  const words = name.replace(/_/g, " ");
  return done ? `Finished ${words}` : `Running ${words}`;
}

type PlaceHandlers = {
  onPlacesHover?: (placeId: string | null) => void;
  onPlaceClick?: (placeId: string) => void;
};

function PlaceTiles({ output, onPlacesHover, onPlaceClick }: { output: FindPlacesOutput } & PlaceHandlers) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-2" onMouseLeave={() => onPlacesHover?.(null)}>
      {output.places.map((place) => (
        <li key={place.tripPlaceId}>
          <button
            type="button"
            className="w-full rounded-card bg-surface-raised px-3 py-2 text-left hairline transition-colors hover:bg-surface"
            onMouseEnter={() => onPlacesHover?.(place.tripPlaceId)}
            onFocus={() => onPlacesHover?.(place.tripPlaceId)}
            onClick={() => onPlaceClick?.(place.tripPlaceId)}
          >
            <span className="block truncate text-ink">{place.name}</span>
            <span className="block truncate text-text-2">
              {[place.category, place.neighborhood, place.score !== undefined ? `${place.score} match` : undefined]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function progressLine(name: string, output: unknown): string | undefined {
  const places = readPlacesOutput(output);
  if (places) {
    const step = places.done !== undefined && places.total !== undefined ? ` · step ${places.done}` : "";
    return `${places.count} found · ${(places.elapsedMs / 1000).toFixed(1)} s${step}`;
  }
  if (name === "slow_count" && typeof output === "object" && output !== null && "count" in output && "total" in output) {
    return `${String(output.count)} of ${String(output.total)}`;
  }
  return undefined;
}

export function ToolCard({
  part,
  onRetry,
  ...handlers
}: { part: ToolPart; onRetry?: () => void } & PlaceHandlers) {
  const name = getToolName(part);
  const settled = part.state === "output-available" && !part.preliminary;
  const failed = part.state === "output-error";
  const running = !settled && !failed && part.state !== "output-denied";
  const output = part.state === "output-available" ? part.output : undefined;
  const places = readPlacesOutput(output);
  const line = output !== undefined ? progressLine(name, output) : undefined;

  return (
    <div
      className="rise-in rounded-card bg-surface/70 px-3 py-2.5 hairline"
      data-testid="tool-card"
      data-tool={name}
      data-state={part.state}
      data-preliminary={part.state === "output-available" && part.preliminary ? "true" : "false"}
    >
      <div className="flex items-center gap-2">
        {running ? (
          <LoaderCircle aria-hidden className="size-3.5 animate-spin text-amber" strokeWidth={1.75} />
        ) : failed ? (
          <CircleAlert aria-hidden className="size-3.5 text-amber" strokeWidth={1.75} />
        ) : (
          <Check aria-hidden className="size-3.5 text-green" strokeWidth={1.75} />
        )}
        <span className="label-caps text-text-2">{label(name, settled)}</span>
        {line ? <span className="ml-auto text-text-2">{line}</span> : null}
      </div>

      {part.state === "input-streaming" ? <p className="mt-1 text-text-2">Preparing the request</p> : null}

      {failed ? (
        <div className="mt-1.5 flex items-start gap-3">
          <p className="text-text-3" data-testid="tool-error">
            {part.errorText}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-ink hairline hover:bg-surface-raised"
            >
              <RotateCcw aria-hidden className="size-3" strokeWidth={1.75} />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {places && places.places.length > 0 ? <PlaceTiles output={places} {...handlers} /> : null}
    </div>
  );
}
