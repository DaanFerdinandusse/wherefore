"use client";

import { useEffect, useState } from "react";

import type { TripStage } from "@/lib/contracts";
import { moveTripToStage, resetTripStage } from "@/lib/trips/actions";
import { computeStage } from "@/lib/trips/stage";

import { findCard, moveCard, restoreCard, stageLabel, type TripsBoardState } from "./columns";

// The board's and the list's stage moves: the card moves at once and the
// override saves in the background; a failed save puts the card back and
// says so for five seconds. `announcement` is for a polite live region.
export function useTripMoves(initial: TripsBoardState, today: string) {
  const [grouped, setGrouped] = useState(initial);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  async function move(tripId: string, to: TripStage) {
    const card = findCard(grouped, tripId);
    if (!card || card.stage === to) return;
    setGrouped((current) => moveCard(current, tripId, to));
    setAnnouncement(`Moved ${card.title} to ${stageLabel(to)}.`);
    const result = await moveTripToStage(tripId, to);
    if (!result.ok) {
      setGrouped((current) => restoreCard(current, card));
      setAnnouncement("");
      setError(result.error);
    }
  }

  /** Drops the override: the card moves to the stage its dates and share link give it. */
  async function resetStage(tripId: string) {
    const card = findCard(grouped, tripId);
    if (!card || !card.stageOverride) return;
    const to = computeStage({ ...card, stageOverride: null }, today);
    setGrouped((current) => moveCard(current, tripId, to, null));
    setAnnouncement(`${card.title} is back in ${stageLabel(to)}.`);
    const result = await resetTripStage(tripId);
    if (!result.ok) {
      setGrouped((current) => restoreCard(current, card));
      setAnnouncement("");
      setError(result.error);
    } else if (result.stage !== to) {
      setGrouped((current) => moveCard(current, tripId, result.stage, null));
    }
  }

  return { grouped, move, resetStage, announcement, error };
}
