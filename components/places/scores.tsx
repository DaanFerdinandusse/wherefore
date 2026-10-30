"use client";

import { createContext, Suspense, use, type ReactNode } from "react";

import type { ClientPlaceScores } from "@/lib/places/contracts";

// The city's places scored for one client. The page starts the scoring call
// and hands the promise down without waiting, so the cards render at once and
// each score pill fills in when the answer streams in. One context, so the
// promise crosses the server boundary once.

type ScoresValue = { scores: Promise<ClientPlaceScores>; clientName: string; firstName: string } | null;

const ScoresContext = createContext<ScoresValue>(null);

export function ScoresProvider({
  scores,
  clientName,
  firstName,
  children,
}: {
  scores: Promise<ClientPlaceScores> | null;
  clientName: string;
  firstName: string;
  children: ReactNode;
}) {
  return <ScoresContext value={scores ? { scores, clientName, firstName } : null}>{children}</ScoresContext>;
}

/** "94 for Ana" on a card, a soft placeholder while scoring, nothing when unscored. */
export function ScorePill({ entityId }: { entityId: string }) {
  const value = use(ScoresContext);
  if (!value) return null;
  return (
    <Suspense fallback={<span aria-hidden className="h-[26px] w-[74px] shrink-0 rounded-pill bg-amber-wash/60 motion-safe:animate-pulse" />}>
      <ScorePillValue scores={value.scores} entityId={entityId} firstName={value.firstName} clientName={value.clientName} />
    </Suspense>
  );
}

function ScorePillValue({
  scores,
  entityId,
  firstName,
  clientName,
}: {
  scores: Promise<ClientPlaceScores>;
  entityId: string;
  firstName: string;
  clientName: string;
}) {
  const result = use(scores);
  const score = result.status === "scored" ? result.scores[entityId] : undefined;
  if (score === undefined) return null;
  return (
    <span
      title={`Taste match for ${clientName}`}
      className="flex shrink-0 items-baseline gap-1.25 rounded-pill bg-amber-wash px-2.75 pt-0.75 pb-1"
    >
      <span className="font-display text-lg leading-5 tracking-normal text-ink">{score}</span>
      <span className="text-meta font-semibold text-amber">for {firstName}</span>
      <span className="sr-only">, taste match for {clientName}</span>
    </span>
  );
}

/** One line next to the client picker when scoring could not happen. */
export function ScoreStatus() {
  const value = use(ScoresContext);
  if (!value) return null;
  return (
    <Suspense fallback={<span className="text-ui-sm text-text-2">Scoring for {value.firstName}</span>}>
      <ScoreStatusValue scores={value.scores} firstName={value.firstName} />
    </Suspense>
  );
}

function ScoreStatusValue({ scores, firstName }: { scores: Promise<ClientPlaceScores>; firstName: string }) {
  const result = use(scores);
  if (result.status === "no-favorites") {
    return (
      <span role="status" className="text-ui-sm text-text-2">
        {firstName} has no matched favorites yet, so nothing is scored.
      </span>
    );
  }
  if (result.status === "failed") {
    return (
      <span role="status" className="text-ui-sm text-amber">
        Scores did not load. Reload the page to try again.
      </span>
    );
  }
  return null;
}
