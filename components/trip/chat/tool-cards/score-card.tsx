"use client";

import { BookmarkMark } from "@/components/ui/bookmark-mark";
import type { ScorePlacesOutput } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

import { CardFrame, CardHeader, ErrorRow, type PlaceHandlers } from "./parts";

// score_places: ranked rows, each with its score and the client favorites
// that drive it as bars (shares from the match data, never from the model).

type Props = PlaceHandlers & {
  state: string;
  preliminary: boolean;
  output?: ScorePlacesOutput;
  errorText?: string;
  onRetry?: () => void;
};

export function ScoreCard({ state, preliminary, output, errorText, onRetry, onPlacesHover, onPlaceClick }: Props) {
  const failed = state === "output-error";
  const running = !failed && (state !== "output-available" || preliminary);
  const rows = output?.places ?? [];
  return (
    <CardFrame tool="score_places" state={state} preliminary={preliminary}>
      <CardHeader
        state={failed ? "failed" : running ? "running" : "done"}
        title={running ? "Scoring places" : `Scored ${rows.length} ${rows.length === 1 ? "place" : "places"}`}
        details={output?.unresolved?.length ? `Not found: ${output.unresolved.join(", ")}` : undefined}
      />
      {rows.length > 0 ? (
        <ol className="flex flex-col gap-1 pl-8" onMouseLeave={() => onPlacesHover?.(null)}>
          {rows.map((row, index) => {
            const onBoard = Boolean(row.tripPlaceId);
            return (
              <li key={`${row.entityId ?? row.placeId}-${index}`}>
                <button
                  type="button"
                  disabled={!onBoard}
                  data-testid="score-row"
                  onMouseEnter={() => onBoard && onPlacesHover?.(row.tripPlaceId)}
                  onClick={() => onBoard && onPlaceClick?.(row.tripPlaceId)}
                  className={cn(
                    "flex w-full flex-col gap-1.5 rounded-row px-2 py-2 text-left",
                    onBoard ? "hover:bg-surface" : "cursor-default",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-ui-sm font-semibold text-ink tabular-nums">{row.score ?? "–"}</span>
                    <span className="min-w-0 grow truncate text-ui-sm font-semibold text-ink">{row.name}</span>
                    {row.yourPlace ? <BookmarkMark size={20} label="Your place" /> : null}
                    {!onBoard ? <span className="shrink-0 text-meta text-text-2">Not on the board</span> : null}
                  </span>
                  {row.because.length > 0 ? (
                    <span className="flex flex-col gap-1 pl-10">
                      {row.because.slice(0, 3).map((driver) => (
                        <span key={driver.entityId} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate text-meta text-text-2">{driver.name}</span>
                          <span className="h-1 grow overflow-hidden rounded-pill bg-rule">
                            <span className="block h-full rounded-pill bg-ink" style={{ width: `${driver.share}%` }} />
                          </span>
                          <span className="w-9 shrink-0 text-right text-meta text-text-2 tabular-nums">{driver.share}%</span>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
      {failed || output?.error ? (
        <ErrorRow message={output?.error ?? errorText ?? "Scoring did not finish."} onRetry={failed ? onRetry : undefined} />
      ) : null}
    </CardFrame>
  );
}
