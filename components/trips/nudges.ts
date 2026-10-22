// The Trips page's quiet assistant: plain sentences computed from the trips
// rows, no model call. Each nudge links to the trip it is about.

import type { TripCard, TripsByStage } from "@/lib/trips/contracts";

import { daysUntil, firstName, plural, tripDayToday } from "./format";

export type Nudge = {
  tripId: string;
  text: string;
  /** Chip label, for example "Open Lisbon". */
  action: string;
  /** Lower comes first. */
  priority: number;
  /** Tie breaker: days until the trip matters, sooner first. */
  soon: number;
};

/** Trips leaving within this many days get a nudge. */
export const LEAVING_SOON_DAYS = 7;

function destinationOf(card: TripCard): string {
  return card.destination.name;
}

function nudgeFor(card: TripCard, today: string): Nudge | null {
  const who = firstName(card.clientName);
  const where = destinationOf(card);
  const action = `Open ${where}`;

  if (card.seedStatus === "failed") {
    return { tripId: card.id, text: `The first list for ${card.title} could not be built.`, action, priority: 0, soon: 0 };
  }

  if (card.stage === "traveling") {
    const day = tripDayToday(card, today);
    if (day === null) return null;
    return {
      tripId: card.id,
      text: `${who} is in ${where}, day ${day} of ${card.counts.days}.`,
      action,
      priority: 1,
      soon: 0,
    };
  }

  if (card.stage === "planning" || card.stage === "shared") {
    const until = daysUntil(card.startDate, today);
    if (until === null || until > LEAVING_SOON_DAYS) return null;
    const when = until === 1 ? "tomorrow" : `in ${until} days`;
    const empty = card.counts.emptyDays;
    const text =
      empty > 0
        ? `${who} leaves for ${where} ${when}, ${plural(empty, "day")} still empty.`
        : `${who} leaves for ${where} ${when}.`;
    return { tripId: card.id, text, action, priority: empty > 0 ? 0 : 2, soon: until };
  }

  return null;
}

/** Nudges for the dock, most urgent first, at most `limit`. */
export function buildNudges(grouped: TripsByStage, today: string, limit = 3): Nudge[] {
  const cards = [...grouped.planning, ...grouped.shared, ...grouped.traveling];
  return cards
    .map((card) => nudgeFor(card, today))
    .filter((n): n is Nudge => n !== null)
    .sort((a, b) => a.priority - b.priority || a.soon - b.soon)
    .slice(0, limit);
}

export const QUIET_NUDGE = "Nothing needs you right now.";

/** The dock's sentence: the first two nudges, or the quiet line. */
export function nudgeMessage(nudges: Nudge[]): string {
  if (nudges.length === 0) return QUIET_NUDGE;
  return nudges
    .slice(0, 2)
    .map((n) => n.text)
    .join(" ");
}

/** The line under the page title: "3 trips in progress. Priya is on day 2 in Lisbon." */
export function summaryLine(grouped: TripsByStage, today: string): string {
  const inProgress = grouped.planning.length + grouped.shared.length + grouped.traveling.length;
  const head = inProgress === 0 ? "No trips in progress." : `${plural(inProgress, "trip")} in progress.`;
  const traveling = grouped.traveling
    .map((card) => ({ card, day: tripDayToday(card, today) }))
    .find((t) => t.day !== null);
  if (!traveling) return head;
  return `${head} ${firstName(traveling.card.clientName)} is on day ${traveling.day} in ${destinationOf(traveling.card)}.`;
}
