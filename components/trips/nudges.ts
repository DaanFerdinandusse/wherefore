// "Needs you": plain nudges computed from the trips rows, no model call.
// Each one is a fact about one trip that asks for the advisor: a link not
// opened, a search with places to review, a traveler with tonight open, a
// departure with empty days. Nothing here is guessed; no fact, no nudge.

import type { TripStage } from "@/lib/contracts";
import type { TripCard } from "@/lib/trips/contracts";

import type { TripsBoardState } from "./columns";
import { dayMonthLabel, daysUntil, firstName, plural, tripDayToday } from "./format";
import { daysSince, shareState, tonightOpen } from "./status";

export type NudgeKind = "not-opened" | "search-done" | "tonight-open" | "leaving-soon";

export type Nudge = {
  tripId: string;
  kind: NudgeKind;
  /** "Marcus hasn't opened Tokyo". */
  title: string;
  /** "Sent 4 days ago · leaves 3 Dec". */
  detail: string;
  imageUrl: string | null;
  /** The client is traveling now: a green dot on the photo. */
  live: boolean;
  /** For "Draft a nudge": the link and the message to send with it. */
  draft: NudgeDraft | null;
  /** Lower comes first. */
  priority: number;
  /** Tie breaker: days until departure, sooner first. */
  soon: number;
};

export type NudgeDraft = { subject: string; message: string; url: string };

/** A shared link unopened for this many days gets a nudge. */
export const NOT_OPENED_NUDGE_DAYS = 2;
/** A search finished within this many days, with nothing placed yet, gets a nudge. */
export const SEARCH_DONE_NUDGE_DAYS = 3;
/** Trips leaving within this many days with empty days get a nudge. */
export const LEAVING_SOON_DAYS = 7;
/** At most this many nudges in the row. */
export const NUDGE_LIMIT = 3;

/** The message "Draft a nudge" prepares: short, in the advisor's voice, with the link. */
export function nudgeDraft(card: Pick<TripCard, "clientName" | "destination" | "startDate">, url: string): NudgeDraft {
  const who = firstName(card.clientName);
  const where = card.destination.name;
  const leaves = card.startDate ? ` You leave on ${dayMonthLabel(card.startDate)}, so there is still time.` : "";
  return {
    subject: `Your ${where} itinerary`,
    message: `Hi ${who}, your ${where} itinerary is ready: ${url}\n\nHave a look when you have a minute and tell me what you would change.${leaves}`,
    url,
  };
}

/** A mailto link with the draft as subject and body, no recipient. */
export function mailtoHref(draft: NudgeDraft): string {
  return `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.message)}`;
}

function nudgeFor(
  card: TripCard,
  today: string,
  now: Date,
  shareUrlFor: (token: string) => string,
): Nudge | null {
  const who = firstName(card.clientName);
  const where = card.destination.name;
  const base = { tripId: card.id, imageUrl: card.imageUrl, live: false, draft: null };
  const until = daysUntil(card.startDate, today);

  if (card.stage === "traveling") {
    const day = tripDayToday(card, today);
    if (day === null || !tonightOpen(card, today)) return null;
    return {
      ...base,
      kind: "tonight-open",
      title: `${who} is in ${where}`,
      detail: `Day ${day} of ${card.counts.days} · tonight is still open`,
      live: true,
      priority: 0,
      soon: 0,
    };
  }

  if (card.stage === "shared") {
    const share = shareState(card, now);
    const notStarted = !card.startDate || card.startDate > today;
    if (share.kind === "not-opened" && share.days >= NOT_OPENED_NUDGE_DAYS && notStarted && card.shareToken) {
      const leaves = card.startDate ? ` · leaves ${dayMonthLabel(card.startDate)}` : "";
      return {
        ...base,
        kind: "not-opened",
        title: `${who} hasn't opened ${where}`,
        detail: `Sent ${plural(share.days, "day")} ago${leaves}`,
        draft: nudgeDraft(card, shareUrlFor(card.shareToken)),
        priority: 1,
        soon: until ?? Number.MAX_SAFE_INTEGER,
      };
    }
  }

  if ((card.stage === "planning" || card.stage === "shared") && until !== null && until <= LEAVING_SOON_DAYS) {
    const empty = card.counts.emptyDays;
    if (empty > 0) {
      return {
        ...base,
        kind: "leaving-soon",
        title: `${who} leaves for ${where} ${until === 1 ? "tomorrow" : `in ${until} days`}`,
        detail: `${plural(empty, "day")} still empty`,
        priority: 1,
        soon: until,
      };
    }
  }

  const ask = card.lastAsk;
  if (
    card.stage === "planning" &&
    ask?.status === "done" &&
    daysSince(ask.updatedAt, now) <= SEARCH_DONE_NUDGE_DAYS &&
    card.counts.places > 0 &&
    card.counts.filledSlots === 0
  ) {
    return {
      ...base,
      kind: "search-done",
      title: `${who}'s ${where} search is done`,
      detail: `${plural(card.counts.places, "place")} ready to review`,
      priority: 2,
      soon: until ?? Number.MAX_SAFE_INTEGER,
    };
  }

  return null;
}

/** The "Needs you" row: most urgent first, at most `limit`, one per trip. */
export function buildNudges(
  grouped: TripsBoardState,
  today: string,
  now: Date,
  shareUrlFor: (token: string) => string,
  limit = NUDGE_LIMIT,
): Nudge[] {
  const cards = [...grouped.traveling, ...grouped.shared, ...grouped.planning];
  return cards
    .map((card) => nudgeFor(card, today, now, shareUrlFor))
    .filter((n): n is Nudge => n !== null)
    .sort((a, b) => a.priority - b.priority || a.soon - b.soon)
    .slice(0, limit);
}

export type StageTotals = Record<TripStage, number>;

/** The line under "Trips": "6 in progress, 12 done. Drag a card to move it along." */
export function summaryLine(totals: StageTotals, view: "board" | "list"): string {
  const inProgress = totals.planning + totals.shared + totals.traveling;
  if (inProgress + totals.done === 0) return "No trips yet.";
  const counts = totals.done > 0 ? `${inProgress} in progress, ${totals.done} done.` : `${inProgress} in progress.`;
  return view === "board" ? `${counts} Drag a card to move it along.` : counts;
}
