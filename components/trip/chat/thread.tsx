"use client";

import { getToolName, isToolUIPart } from "ai";
import { CalendarCheck, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { FilmImage } from "@/components/ui/film-image";
import type { AppUIMessage, ChatOpening, FindPlacesOutput, ItinerarySlot } from "@/lib/contracts";
import { withoutRegionMarker } from "@/lib/map/region-prompt";
import { cn } from "@/lib/ui/cn";

import { isInSlot, pickLine } from "../place-profile/card-format";

import { toolErrorText } from "./chat-errors";
import { readPlacesOutput, readRecommendOutput } from "./chat-places";
import { recommendationsOf, type Recommendation } from "./chat-format";
import { ToolCard } from "./tool-card";
import { chatActivity } from "./chat-activity";
import { StreamingText, ThinkingIndicator, ThinkingSummary } from "./streaming-parts";
import type { PlaceHandlers } from "./tool-cards/parts";
import { SearchResults } from "./search-results";

// The chat thread (Paper G1, S1 to S5): the opening for an empty chat (the
// "Trip created" line and a greeting composed from facts), advisor messages
// as dark ink bubbles on the right, agent text as soft surface blocks, a
// search row per find_places, and the recommendation: the latest as the full
// place card, earlier ones as one line ("Added to Fri dinner · 92 match").
// Readable reasoning summaries appear in expandable disclosures.
// Reading tools (trip context, a place's facts) show only when they fail.

const QUIET_TOOLS = new Set(["get_trip_context", "lookup_place"]);

type Props = PlaceHandlers & {
  messages: AppUIMessage[];
  streaming: boolean;
  opening?: ChatOpening | null;
  /** The recommend_place call shown as the full card. */
  liveRecommendationId?: string;
  /** Ask id to its pick. */
  picks: Map<string, string>;
  slots: ItinerarySlot[];
  clientName: string;
  onRetryAsk: (assistantMessageId: string) => void;
  renderCard: (recommendation: Recommendation) => ReactNode;
  placeName?: (tripPlaceId: string) => string | undefined;
};


export function OpeningMessage({ opening }: { opening: ChatOpening }) {
  return (
    <>
      <li className="flex items-center gap-3 rounded-2xl bg-surface py-2.5 pr-3.5 pl-2.5 ring-1 ring-ink/6" data-testid="opening-created">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-raised ring-1 ring-ink/8">
          <CalendarCheck aria-hidden className="size-4 text-ink" strokeWidth={2} />
        </span>
        <p className="min-w-0 grow text-ui leading-4.75 text-text-3">
          <span className="font-semibold text-ink">Trip created:</span> {opening.created}
        </p>
        <p className="shrink-0 text-ui-sm leading-4 text-text-2">{opening.createdFrom}</p>
      </li>
      <li className="flex flex-col gap-3.5 rounded-[22px] bg-surface px-5 pt-4 pb-4.5" data-testid="opening-message">
        {opening.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-chat text-ink">
            {paragraph}
          </p>
        ))}
      </li>
    </>
  );
}

function PickRow({ recommendation, slots, clientName, onPlaceClick }: { recommendation: Recommendation; slots: ItinerarySlot[]; clientName: string } & PlaceHandlers) {
  const { card, target } = recommendation;
  const added = target ? isInSlot(slots, card.tripPlaceId, target) : slots.some((s) => s.tripPlaceId === card.tripPlaceId);
  return (
    <div className="flex items-center gap-3.5 rounded-[18px] bg-surface-raised py-2 pr-4 pl-2 shadow-soft" data-testid="pick-row">
      <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-avatar">
        {card.imageUrl ? <FilmImage src={card.imageUrl} alt="" sizes="64px" unoptimized /> : null}
      </span>
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate text-body leading-5 font-semibold text-ink">{card.name}</span>
        <span className="truncate text-ui-sm leading-4.25 text-text-2">
          {pickLine({ added, targetLabel: target?.label, score: card.score, because: card.because, clientName })}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onPlaceClick?.(card.tripPlaceId)}
        className="shrink-0 text-ui font-semibold text-ink underline decoration-ink/40 underline-offset-2"
      >
        Open card
      </button>
    </div>
  );
}

export function Thread({
  messages,
  streaming,
  opening,
  liveRecommendationId,
  picks,
  slots,
  clientName,
  onRetryAsk,
  renderCard,
  placeName,
  ...handlers
}: Props) {
  const visible = messages.filter((m) => !m.metadata?.hidden);
  const last = visible.at(-1);
  const recommendations = recommendationsOf(visible);
  const searchAskIds = new Set(visible.flatMap((message) => message.parts.flatMap((part) => {
    if (!isToolUIPart(part) || getToolName(part) !== "find_places" || part.state !== "output-available") return [];
    const output = readPlacesOutput(part.output);
    return output?.places.length && output.askId ? [output.askId] : [];
  })));

  return (
    <ol className="flex flex-col gap-3.5" data-testid="message-list">
      {visible.length === 0 && opening ? <OpeningMessage opening={opening} /> : null}
      {visible.map((message) => {
        if (message.role === "user") {
          const text = withoutRegionMarker(message.parts.map((p) => (p.type === "text" ? p.text : "")).join(""));
          return (
            <li key={message.id} className="flex justify-end">
              <p
                data-testid="user-message"
                className="max-w-[min(480px,85%)] rounded-t-[20px] rounded-br-md rounded-bl-[20px] bg-ink px-4 py-2.5 text-body leading-5.25 whitespace-pre-wrap text-white"
              >
                {text}
              </p>
            </li>
          );
        }
        const isLive = streaming && message.id === last?.id;
        const lastTextIndex = message.parts.findLastIndex((p) => p.type === "text");
        return (
          <li
            key={message.id}
            data-testid="assistant-message"
            data-stopped={message.metadata?.stopped ? "true" : "false"}
            className="flex flex-col gap-3.5"
          >
            {message.parts.map((part, index) => {
              if (part.type === "reasoning") {
                if (isLive && part.state === "streaming") return null;
                return <ThinkingSummary key={`${message.id}-${index}`} text={part.text} active={false} />;
              }
              if (part.type === "text") {
                if (!part.text.trim() && !(isLive && index === lastTextIndex)) return null;
                return (
                  <p
                    key={`${message.id}-${index}`}
                    data-testid="assistant-text"
                    className="rounded-[22px] bg-surface px-5 py-3.5 text-chat whitespace-pre-wrap text-ink"
                  >
                    <StreamingText text={part.text} active={isLive && index === lastTextIndex && part.state === "streaming"} />
                  </p>
                );
              }
              if (!isToolUIPart(part)) return null;
              const name = getToolName(part);
              const preliminary = part.state === "output-available" && Boolean(part.preliminary);
              const retry = !streaming ? () => onRetryAsk(message.id) : undefined;

              if (name === "find_places") {
                const output: FindPlacesOutput | undefined = part.state === "output-available" ? readPlacesOutput(part.output) : undefined;
                return (
                  <SearchResults
                    key={part.toolCallId}
                    state={part.state}
                    preliminary={preliminary}
                    input={typeof part.input === "object" && part.input !== null ? (part.input as { intent?: string }) : undefined}
                    output={output}
                    errorText={part.state === "output-error" ? part.errorText : undefined}
                    onRetry={retry}
                    pickedId={output?.askId ? picks.get(output.askId) : undefined}
                    recommendation={recommendations.findLast((r) => r.askId === output?.askId && Boolean(r.askId))}
                    liveRecommendationId={liveRecommendationId}
                    renderCard={renderCard}
                    {...handlers}
                  />
                );
              }

              if (name === "recommend_place") {
                if (part.state !== "output-available" && part.state !== "output-error") {
                  return <RecommendPending key={part.toolCallId} />;
                }
                const output = part.state === "output-available" ? readRecommendOutput(part.output) : undefined;
                if (!output) {
                  const error =
                    part.state === "output-error"
                      ? part.errorText
                      : typeof part.output === "object" && part.output && "error" in part.output && typeof part.output.error === "string"
                        ? part.output.error
                        : "The pick could not be shown.";
                  return <SmallError key={part.toolCallId} text={toolErrorText(error, "pick")} />;
                }
                if (part.toolCallId === liveRecommendationId && output.askId && searchAskIds.has(output.askId)) return null;
                const recommendation = { ...output, toolCallId: part.toolCallId };
                return (
                  <div key={part.toolCallId}>
                    {part.toolCallId === liveRecommendationId ? (
                      renderCard(recommendation)
                    ) : (
                      <PickRow recommendation={recommendation} slots={slots} clientName={clientName} {...handlers} />
                    )}
                  </div>
                );
              }

              if (QUIET_TOOLS.has(name) && part.state !== "output-error") return null;
              return (
                <ToolCard key={part.toolCallId} part={part} onRetry={retry} placeName={placeName} {...handlers} />
              );
            })}
            {message.metadata?.stopped ? <p className="label-caps px-1 text-text-2">Stopped</p> : null}
          </li>
        );
      })}
      <ThinkingIndicator activity={chatActivity(messages, streaming)} />
    </ol>
  );
}

function RecommendPending() {
  return (
    <div aria-label="Preparing the pick" className="flex flex-col gap-3.5" data-testid="recommend-pending">
      <div className="flex h-50 gap-1.5">
        <span className="skeleton-sheen w-[52%] rounded-l-photo rounded-r-lg" />
        <span className="skeleton-sheen w-[27.5%] rounded-lg" />
        <span className="skeleton-sheen grow rounded-l-lg rounded-r-photo" />
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="h-5 w-65 rounded-pill bg-skeleton" />
        <span className="h-9 w-62.5 rounded-pill bg-ink/7" />
      </div>
    </div>
  );
}

function SmallError({ text }: { text: string }) {
  return (
    <p className={cn("flex items-start gap-2 px-1 text-ui text-text-3")} role="alert" data-testid="tool-error">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" strokeWidth={1.75} />
      {text}
    </p>
  );
}
