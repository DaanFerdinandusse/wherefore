"use client";

import { useState, type ComponentProps, type ReactNode } from "react";

import type { Recommendation } from "./chat-format";
import { SearchRow } from "./tool-cards/search-row";

type Props = ComponentProps<typeof SearchRow> & {
  recommendation?: Recommendation;
  liveRecommendationId?: string;
  renderCard: (recommendation: Recommendation) => ReactNode;
};

/** Browsing a result is local to its search, separate from the itinerary's pick. */
export function SearchResults({ recommendation, liveRecommendationId, renderCard, ...props }: Props) {
  const [selectedId, setSelectedId] = useState<string>();
  const selected = props.output?.places.find((place) => place.tripPlaceId === selectedId);
  const current = recommendation?.toolCallId === liveRecommendationId ? recommendation : undefined;
  const browsed: Recommendation | undefined = selected
    ? {
        card: selected,
        askId: props.output?.askId,
        target: recommendation?.target ?? props.output?.target,
        toolCallId: recommendation?.toolCallId ?? selected.tripPlaceId,
        clientNote: selected.tripPlaceId === recommendation?.card.tripPlaceId ? recommendation.clientNote : undefined,
      }
    : current;
  const verdict = props.output?.verdicts?.find((v) => v.tripPlaceId === browsed?.card.tripPlaceId);
  const shown = browsed && verdict ? { ...browsed, verdict } : browsed;

  return (
    <div className="flex flex-col gap-3.5" data-testid="search-results">
      <SearchRow {...props} selectedId={shown?.card.tripPlaceId} onPlaceClick={setSelectedId} />
      {shown ? <div data-testid="search-result-card">{renderCard(shown)}</div> : null}
    </div>
  );
}
