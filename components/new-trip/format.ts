// Pure copy for the New trip panel: client rows, traveler rows, city cards
// and the line under the bar. Every part comes from a stored fact; a part
// without one is left out (null), never guessed.

import { firstName } from "@/components/trips/format";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

type NextTrip = { title: string; startDate: string | null } | null;

function monthShort(iso: string): string {
  return MONTHS_SHORT[Number(iso.slice(5, 7)) - 1] ?? "";
}

/**
 * "Mexico City in Nov" from the trip "Mexico City for Ana" starting in
 * November; the default " for <first name>" suffix is dropped because the row
 * already names her. The next trip has not ended, so one that started on or
 * before `today` is under way: "in Lisbon now".
 */
export function nextTripLabel(nextTrip: NextTrip, clientName: string, today?: string): string | null {
  if (!nextTrip) return null;
  const suffix = ` for ${firstName(clientName)}`;
  const base = nextTrip.title.endsWith(suffix) ? nextTrip.title.slice(0, -suffix.length) : nextTrip.title;
  if (!nextTrip.startDate) return `${base}, no dates yet`;
  if (today && nextTrip.startDate <= today) return `in ${base} now`;
  return `${base} in ${monthShort(nextTrip.startDate)}`;
}

/** The recent client row: "Mexico City in Nov". Null with no trip ahead. */
export function clientLine(client: { name: string; nextTrip: NextTrip }, today?: string): string | null {
  return nextTripLabel(client.nextTrip, client.name, today);
}

/** A client match under "Add a traveler": their next trip, when they have one. */
export function clientDescription(client: { name: string; nextTrip: NextTrip }): string {
  return [nextTripLabel(client.nextTrip, client.name)]
    .filter(Boolean)
    .join(" · ");
}

/** The client row in Travelers: "Ana's 5 favorites drive the search". */
export function clientTravelerNote(name: string, favoritesCount: number): { text: string; warning: boolean } {
  const first = firstName(name);
  if (favoritesCount === 0) return { text: `${first} has no favorites yet`, warning: true };
  return { text: `${first}'s favorites drive the search`, warning: false };
}

/**
 * A companion row in Travelers. One of the advisor's clients brings their own
 * favorites; a guest is a name on the trip and nothing more.
 */
export function companionNote(
  companion: { name: string; clientId: string | null; favoritesCount: number },
  clientName: string | null,
): string | null {
  if (!companion.clientId) return clientName ? `Travels with ${firstName(clientName)}` : null;
  if (companion.favoritesCount === 0) return "No favorites yet";
  return `${firstName(companion.name)}'s favorites join the search`;
}

/** The line under the bar once the trip can be created. */
export function createHint(clientName: string, favoritesCount: number): string {
  const first = firstName(clientName);
  const searches =
    favoritesCount > 0 ? `it searches from ${first}'s favorites` : "it starts the search from there";
  return `Creating the trip opens a chat. Tell it what ${first} wants and ${searches}. You can change anything later.`;
}

/** "Portugal" for "PT"; null when the code is missing or unknown. */
export function countryName(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase());
    return name && name.toUpperCase() !== code.toUpperCase() ? name : null;
  } catch {
    return null;
  }
}

/** The Where segment: "Lisbon, Portugal" when the country is known and not already in the name. */
export function destinationLabel(destination: { name: string; countryCode?: string | null }): string {
  const country = countryName(destination.countryCode);
  if (!country || destination.name.toLowerCase().includes(country.toLowerCase())) return destination.name;
  return `${destination.name}, ${country}`;
}

/**
 * The line under a city card: the advisor's place count (shown in amber) and
 * whether the client went. `went` is the last trip's start date, null for a
 * trip without dates, undefined when the client has not been.
 */
export function cityCardLine({
  count,
  clientName,
  went,
}: {
  count: number;
  clientName: string | null;
  went: string | null | undefined;
}): { places: string | null; rest: string | null } {
  const places = count > 0 ? `${count} of your places` : null;
  if (!clientName) return { places, rest: null };
  const first = firstName(clientName);
  if (went === undefined) return { places, rest: `${first} has not been` };
  if (went === null) return { places, rest: `${first} went before` };
  return { places, rest: `${first} went in ${monthShort(went)} ${went.slice(0, 4)}` };
}
