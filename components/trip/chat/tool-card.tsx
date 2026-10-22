"use client";

import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai";
import { Check, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";

import type {
  FindPlacesOutput,
  LookupPlaceOutput,
  RemovePlaceOutput,
  ScorePlacesOutput,
  SetItineraryOutput,
} from "@/lib/contracts";

import { readPlacesOutput } from "./chat-places";
import type { PlaceHandlers } from "./tool-cards/parts";
import { ScoreCard } from "./tool-cards/score-card";
import { SearchCard } from "./tool-cards/search-card";
import { ItineraryCard, LookupCard, RemoveCard } from "./tool-cards/small-cards";

// The tool part switch: one custom card per product tool (components/trip/
// chat/tool-cards), a plain card for the rest (get_trip_context, the spike
// tools). Cards read the tool's output (`details`); the model reads its own
// compact copy (lib/agent/tools/model-output.ts).

export type ToolPart = ToolUIPart | DynamicToolUIPart;

const LABELS: Record<string, { running: string; done: string }> = {
  get_trip_context: { running: "Reading the trip", done: "Read the trip" },
  echo_places: { running: "Searching test places", done: "Searched test places" },
  slow_count: { running: "Counting", done: "Counted" },
};

function label(name: string, done: boolean): string {
  const known = LABELS[name];
  if (known) return done ? known.done : known.running;
  const words = name.replace(/_/g, " ");
  return done ? `Finished ${words}` : `Running ${words}`;
}

function asObject<T>(value: unknown): T | undefined {
  return typeof value === "object" && value !== null ? (value as T) : undefined;
}

function PlainTiles({ output, onPlacesHover, onPlaceClick }: { output: FindPlacesOutput } & PlaceHandlers) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-2" onMouseLeave={() => onPlacesHover?.(null)}>
      {output.places.map((place) => (
        <li key={place.tripPlaceId}>
          <button
            type="button"
            className="w-full rounded-card bg-surface-raised px-3 py-2 text-left hairline transition-colors hover:bg-surface"
            onMouseEnter={() => onPlacesHover?.(place.tripPlaceId)}
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

function PlainCard({ part, name, onRetry, ...handlers }: { part: ToolPart; name: string; onRetry?: () => void } & PlaceHandlers) {
  const settled = part.state === "output-available" && !part.preliminary;
  const failed = part.state === "output-error";
  const running = !settled && !failed && part.state !== "output-denied";
  const output = part.state === "output-available" ? part.output : undefined;
  const places = readPlacesOutput(output);
  let line: string | undefined;
  if (places) line = `${places.count} found · ${(places.elapsedMs / 1000).toFixed(1)} s`;
  const count = asObject<{ count?: unknown; total?: unknown }>(output);
  if (name === "slow_count" && count && "count" in count) line = `${String(count.count)} of ${String(count.total)}`;

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
      {places && places.places.length > 0 ? <PlainTiles output={places} {...handlers} /> : null}
    </div>
  );
}

export function ToolCard({
  part,
  onRetry,
  placeName = () => undefined,
  ...handlers
}: {
  part: ToolPart;
  onRetry?: () => void;
  /** Names of trip places seen in this chat, for the itinerary card. */
  placeName?: (tripPlaceId: string) => string | undefined;
} & PlaceHandlers) {
  const name = getToolName(part);
  const state = part.state;
  const preliminary = part.state === "output-available" && Boolean(part.preliminary);
  const output = part.state === "output-available" ? part.output : undefined;
  const errorText = part.state === "output-error" ? part.errorText : undefined;
  const base = { state, preliminary, errorText, onRetry };

  switch (name) {
    case "find_places":
    case "seed_trip": {
      const places = readPlacesOutput(output);
      return (
        <SearchCard
          tool={name}
          {...base}
          input={asObject<{ intent?: string; day_hint?: string }>(part.input)}
          output={places}
          destination={places?.details?.split(" · ")[0]}
          {...handlers}
        />
      );
    }
    case "score_places":
      return <ScoreCard {...base} output={asObject<ScorePlacesOutput>(output)} {...handlers} />;
    case "set_itinerary":
      return <ItineraryCard {...base} output={asObject<SetItineraryOutput>(output)} placeName={placeName} />;
    case "remove_place":
      return <RemoveCard {...base} output={asObject<RemovePlaceOutput>(output)} {...handlers} />;
    case "lookup_place":
      return <LookupCard {...base} output={asObject<LookupPlaceOutput>(output)} />;
    default:
      return <PlainCard part={part} name={name} onRetry={onRetry} {...handlers} />;
  }
}
