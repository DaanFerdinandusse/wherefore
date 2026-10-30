"use client";

import { ChevronDown } from "lucide-react";

import type { LookupPlaceOutput, RemovePlaceOutput, SetItineraryOutput } from "@/lib/contracts";

import { CardFrame, CardHeader, ErrorRow, PlaceTile, type PlaceHandlers } from "./parts";

// The small tool cards: set_itinerary (applied and rejected lines),
// remove_place (removed and its replacement) and lookup_place (the facts,
// collapsed).

type Base = { state: string; preliminary: boolean; errorText?: string; onRetry?: () => void };

function headerState(state: string, preliminary: boolean) {
  if (state === "output-error") return "failed" as const;
  return state === "output-available" && !preliminary ? ("done" as const) : ("running" as const);
}

const SLOT_NAMES: Record<string, string> = {
  breakfast: "Breakfast",
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  night: "Night",
  stay: "Stay",
};

export function ItineraryCard({
  state,
  preliminary,
  output,
  errorText,
  onRetry,
  placeName,
}: Base & { output?: SetItineraryOutput; placeName: (id: string) => string | undefined }) {
  const status = headerState(state, preliminary);
  const applied = output?.applied ?? [];
  const rejected = output?.rejected ?? [];
  return (
    <CardFrame tool="set_itinerary" state={state} preliminary={preliminary}>
      <CardHeader
        state={status}
        title={status === "running" ? "Updating the itinerary" : `Updated ${applied.length} ${applied.length === 1 ? "slot" : "slots"}`}
        details={rejected.length ? `${rejected.length} not added` : undefined}
      />
      {applied.length > 0 ? (
        <ul className="flex flex-col gap-1 pl-8">
          {applied.map((slot) => (
            <li key={slot.id} className="text-ui-sm text-ink" data-testid="itinerary-applied">
              <span className="font-semibold">
                Day {slot.day} · {SLOT_NAMES[slot.slot] ?? slot.slot}
              </span>
              <span className="text-text-4"> {slot.tripPlaceId ? (placeName(slot.tripPlaceId) ?? "a trip place") : "empty"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {rejected.length > 0 ? (
        <ul className="flex flex-col gap-1 pl-8">
          {rejected.map((r, i) => (
            <li key={`${r.placeId}-${i}`} className="text-ui-sm text-text-3" data-testid="itinerary-rejected">
              {placeName(r.placeId) ? `${placeName(r.placeId)}: ` : ""}
              {r.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {status === "failed" ? <ErrorRow message={errorText ?? "The itinerary was not changed."} onRetry={onRetry} /> : null}
    </CardFrame>
  );
}

export function RemoveCard({ state, preliminary, output, errorText, onRetry, ...handlers }: Base & PlaceHandlers & { output?: RemovePlaceOutput }) {
  const status = headerState(state, preliminary);
  const name = output?.removed?.name;
  return (
    <CardFrame tool="remove_place" state={state} preliminary={preliminary}>
      <CardHeader
        state={output?.error ? "failed" : status}
        title={status === "running" ? "Removing a place" : name ? `Removed ${name}` : "Nothing removed"}
        details={output?.replacement ? `Added ${output.replacement.name} instead` : output?.note}
      />
      {output?.replacement ? (
        <ul className="flex pl-8" onMouseLeave={() => handlers.onPlacesHover?.(null)}>
          <PlaceTile place={output.replacement} {...handlers} />
        </ul>
      ) : null}
      {status === "failed" || output?.error ? (
        <ErrorRow message={output?.error ?? errorText ?? "The place was not removed."} onRetry={status === "failed" ? onRetry : undefined} />
      ) : null}
    </CardFrame>
  );
}

export function LookupCard({ state, preliminary, output, errorText, onRetry }: Base & { output?: LookupPlaceOutput }) {
  const status = headerState(state, preliminary);
  const facts: { label: string; value: string }[] = [];
  if (output?.address) facts.push({ label: "Address", value: output.address });
  if (output?.priceLevel) facts.push({ label: "Price level", value: `${output.priceLevel} of 4` });
  if (output?.description) facts.push({ label: "About", value: output.description });
  if (output?.keywords?.length) facts.push({ label: "Mentioned in reviews", value: output.keywords.slice(0, 8).join(", ") });
  if (output?.tags.length) facts.push({ label: "Tags", value: output.tags.slice(0, 10).join(", ") });
  if (output?.hours) {
    facts.push({
      label: "Hours",
      value: Object.entries(output.hours)
        .map(([day, hours]) => `${day.slice(0, 3)} ${hours}`)
        .join(" · "),
    });
  }
  return (
    <CardFrame tool="lookup_place" state={state} preliminary={preliminary}>
      {facts.length > 0 ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3">
            <CardHeader state={status} title={`Read the facts for ${output?.name ?? "a place"}`} />
            <ChevronDown aria-hidden className="size-4 shrink-0 text-text-2 transition-transform group-open:rotate-180" strokeWidth={1.75} />
          </summary>
          <dl className="mt-2 flex flex-col gap-1.5 pl-8">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col">
                <dt className="label-caps text-text-2">{fact.label}</dt>
                <dd className="text-ui-sm text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : (
        <CardHeader state={output?.error ? "failed" : status} title={status === "running" ? "Reading the facts" : (output?.error ?? "No facts stored")} />
      )}
      {status === "failed" ? <ErrorRow message={errorText ?? "The facts could not be read."} onRetry={onRetry} /> : null}
    </CardFrame>
  );
}
