// Pure copy for the New trip menus: client rows, traveler rows, suggestions.

import { firstName, longMonthYearLabel, plural } from "@/components/trips/format";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

type NextTrip = { title: string; startDate: string | null } | null;

/**
 * "Lisbon in May" from the trip "Lisbon for Ana" starting in May; the default
 * " for <first name>" suffix is dropped because the row already names her.
 */
export function nextTripLabel(nextTrip: NextTrip, clientName: string): string | null {
  if (!nextTrip) return null;
  const suffix = ` for ${firstName(clientName)}`;
  const base = nextTrip.title.endsWith(suffix) ? nextTrip.title.slice(0, -suffix.length) : nextTrip.title;
  if (!nextTrip.startDate) return `${base}, no dates yet`;
  const month = Number(nextTrip.startDate.slice(5, 7)) - 1;
  return `${base} in ${MONTHS_SHORT[month]}`;
}

/** "New York · 6 favorites · Mexico City in Nov". */
export function clientDescription(client: {
  name: string;
  homeCity: string | null;
  favoritesCount: number;
  nextTrip: NextTrip;
}): string {
  return [
    client.homeCity,
    plural(client.favoritesCount, "favorite"),
    nextTripLabel(client.nextTrip, client.name),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The client row in Travelers. */
export function clientTravelerNote(favoritesCount: number): { text: string; warning: boolean } {
  if (favoritesCount === 0) return { text: "Client · no favorites yet", warning: true };
  return { text: `Client · ${plural(favoritesCount, "favorite")} drive the search`, warning: false };
}

/** A guest row in Travelers. */
export function guestTravelerNote(guest: { clientId: string | null; favoritesCount: number }): {
  text: string;
  warning: boolean;
} {
  if (!guest.clientId || guest.favoritesCount === 0) return { text: "Guest · no favorites yet", warning: true };
  return { text: `Guest · ${plural(guest.favoritesCount, "favorite")} join the search`, warning: false };
}

/** "Clara has no favorites yet" / "Clara and Tom have no favorites yet". */
export function missingFavoritesNote(names: string[], clientName: string | null): string | null {
  if (names.length === 0) return null;
  const firsts = names.map(firstName);
  const who =
    firsts.length === 1
      ? firsts[0]
      : `${firsts.slice(0, -1).join(", ")} and ${firsts[firsts.length - 1]}`;
  const verb = firsts.length === 1 ? "has" : "have";
  const follows = clientName ? ` The search follows ${firstName(clientName)}'s taste, and the trip notes who is missing.` : "";
  return `${who} ${verb} no favorites yet.${follows}`;
}

/** "11 of your places · Ana has not been". */
export function citySuggestionDescription(count: number, clientName: string | null, wentBefore: boolean): string {
  const head = `${count} of your places`;
  if (!clientName) return head;
  return `${head} · ${firstName(clientName)} ${wentBefore ? "went before" : "has not been"}`;
}

/** "Last in March 2026 · 2 trips". */
export function pastDestinationDescription(lastStartDate: string | null, tripCount: number): string {
  const parts = [
    lastStartDate ? `Last in ${longMonthYearLabel(lastStartDate)}` : "Dates not set",
    tripCount > 1 ? plural(tripCount, "trip") : null,
  ];
  return parts.filter(Boolean).join(" · ");
}
