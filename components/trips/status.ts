// The one status line on a trip card and in the list, from facts on the row
// only: slots, places, searches, the share link's opens, the dates. When a
// fact is missing the line says less, never more.

import type { TripCard } from "@/lib/trips/contracts";
import { SLOT_ORDER } from "@/lib/trips/map";

import { dayMonthLabel, firstName, plural, tripDayToday } from "./format";

export type StatusIcon = "slots" | "sparkle" | "eye" | "eye-off" | "link" | "pin" | "heart" | "search" | "warning" | "check";

export type CardStatus = {
  icon: StatusIcon;
  text: string;
  /** plain: muted; strong: ink and bold; accent: amber and bold; warning: amber. */
  tone: "plain" | "strong" | "accent" | "warning";
};

const DAY_MS = 86_400_000;

/** Whole days from `then` to `now`, never negative. */
export function daysSince(then: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / DAY_MS));
}

/** "today", "yesterday", "3 days ago". */
export function agoLabel(then: Date, now: Date): string {
  const days = daysSince(then, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Slots the itinerary offers: every slot of every day, as the itinerary counts them. */
export function totalSlots(card: Pick<TripCard, "counts">): number {
  return card.counts.days * SLOT_ORDER.length;
}

/** A trip still being planned for a client without a single favorite. */
export function needsFavorites(card: Pick<TripCard, "stage" | "clientFavorites">): boolean {
  return card.stage === "planning" && card.clientFavorites === 0;
}

/** "Needs Jonas's favorites". */
export function needsFavoritesLabel(clientName: string): string {
  const name = firstName(clientName);
  return `Needs ${name}'s favorites`;
}

export type ShareState =
  | { kind: "none" }
  | { kind: "opened"; lastOpenedAt: Date }
  | { kind: "not-opened"; sharedAt: Date; days: number }
  /** Shared before opens were recorded and no open since: nothing to claim. */
  | { kind: "unknown"; sharedAt: Date };

/**
 * What is known about the share link: opened, not opened for N days, or
 * nothing. A link created before opens were recorded may have been opened
 * without a record, so "not opened" is only said about tracked links.
 */
export function shareState(
  card: Pick<TripCard, "shareToken" | "sharedAt" | "shareLastOpenedAt" | "shareOpensTracked">,
  now: Date,
): ShareState {
  if (!card.shareToken || !card.sharedAt) return { kind: "none" };
  if (card.shareLastOpenedAt) return { kind: "opened", lastOpenedAt: card.shareLastOpenedAt };
  if (!card.shareOpensTracked) return { kind: "unknown", sharedAt: card.sharedAt };
  return { kind: "not-opened", sharedAt: card.sharedAt, days: daysSince(card.sharedAt, now) };
}

/** True when the trip's day today has no dinner or night place yet. */
export function tonightOpen(card: TripCard, today: string): boolean {
  return tripDayToday(card, today) !== null && card.counts.tonightFilled === 0;
}

function planningStatus(card: TripCard): CardStatus {
  if (card.seedStatus === "failed") return { icon: "warning", text: "Could not build the first list", tone: "warning" };
  if (needsFavorites(card)) return { icon: "heart", text: needsFavoritesLabel(card.clientName), tone: "plain" };
  if (card.lastAsk?.status === "running" || card.seedStatus === "running") {
    return { icon: "search", text: "Searching", tone: "plain" };
  }
  const { filledSlots, places } = card.counts;
  if (filledSlots > 0) {
    return { icon: "slots", text: `${filledSlots} of ${totalSlots(card)} slots filled`, tone: "plain" };
  }
  if (places > 0) return { icon: "sparkle", text: `${plural(places, "place")} ready`, tone: "accent" };
  return { icon: "slots", text: "No places yet", tone: "plain" };
}

function sharedStatus(card: TripCard, now: Date): CardStatus {
  const share = shareState(card, now);
  switch (share.kind) {
    case "opened":
      return { icon: "eye", text: `Opened ${agoLabel(share.lastOpenedAt, now)}`, tone: "plain" };
    case "not-opened":
      return share.days === 0
        ? { icon: "link", text: "Sent today", tone: "plain" }
        : { icon: "eye-off", text: `Not opened in ${plural(share.days, "day")}`, tone: "strong" };
    case "unknown":
      return { icon: "link", text: `Sent ${agoLabel(share.sharedAt, now)}`, tone: "plain" };
    case "none":
      return { icon: "link", text: "No link yet", tone: "plain" };
  }
}

function travelingStatus(card: TripCard, today: string): CardStatus {
  const day = tripDayToday(card, today);
  if (day === null) return { icon: "pin", text: plural(card.counts.places, "place"), tone: "plain" };
  const head = `Day ${day} of ${card.counts.days}`;
  return tonightOpen(card, today)
    ? { icon: "pin", text: `${head}, tonight open`, tone: "strong" }
    : { icon: "pin", text: head, tone: "strong" };
}

/** The card's status line for its stage. `today` is the ISO day, `now` the clock. */
export function cardStatus(card: TripCard, today: string, now: Date): CardStatus {
  switch (card.stage) {
    case "planning":
      return planningStatus(card);
    case "shared":
      return sharedStatus(card, now);
    case "traveling":
      return travelingStatus(card, today);
    case "done": {
      const end = card.endDate ?? card.startDate;
      return { icon: "check", text: end ? `Finished ${dayMonthLabel(end)}` : "Finished", tone: "plain" };
    }
  }
}
