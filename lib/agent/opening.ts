import type { ChatOpening, SlotName } from "@/lib/contracts";
import { isFeelWord } from "@/lib/trips/taste-words";

// The first message of an empty chat (S1), composed in code from trip facts:
// no model run and no search happens until the advisor answers. A chat on a
// trip that has nothing planned asks for the brief; a new chat on a trip
// with places in the itinerary says where the itinerary stands. Pure; the
// facts come from lib/agent/opening-data.ts.

export type OpeningFacts = {
  clientName: string;
  /** Every traveler's name, the client first. */
  travelerNames: string[];
  destination: string;
  startDate?: string;
  endDate?: string;
  /** The favorites that drive the searches: resolved places, artists and films. */
  favoritesCount: number;
  /** Favorites saved on the profiles, matched or not. */
  savedFavorites?: number;
  /** Whose favorites those are, the client first; the client when missing. */
  favoriteOwners?: string[];
  /** The advisor's own saved places in the destination. */
  advisorPlacesInCity: number;
  /** Itinerary slots that hold a place. */
  filled: { day: number; slot: SlotName }[];
  /** The number of trip days (from the dates, else what the itinerary uses). */
  dayCount: number;
  /** The client's taste tags, strongest first. */
  taste?: readonly { name: string; type?: string }[];
};

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const BRIEF_QUESTION = "What should this trip be about? A mood, a few must haves, or one slot to start with is enough.";
export const NEXT_QUESTION = "What should we work on next? One slot, a day, or a change to what is there.";

/** "five", "11": words up to nine, digits above. */
export function numberWord(n: number): string {
  return n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n]! : String(n);
}

function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

/** "Ana", "Ana and Clara", "Ana, Clara and Marcus". */
export function joinNames(names: readonly string[]): string {
  const firsts = names.map(firstName).filter(Boolean);
  if (firsts.length <= 1) return firsts[0] ?? "";
  return `${firsts.slice(0, -1).join(", ")} and ${firsts.at(-1)}`;
}

function parts(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) } : null;
}

/** "14 to 18 May", "30 May to 2 Jun", "14 May" for a single day. */
export function dateRange(startDate?: string, endDate?: string): string | null {
  const start = startDate ? parts(startDate) : null;
  if (!start) return null;
  const end = endDate ? parts(endDate) : null;
  if (!end || (end.y === start.y && end.m === start.m && end.d === start.d)) return `${start.d} ${MONTHS[start.m]}`;
  if (end.y === start.y && end.m === start.m) return `${start.d} to ${end.d} ${MONTHS[end.m]}`;
  return `${start.d} ${MONTHS[start.m]} to ${end.d} ${MONTHS[end.m]}`;
}

/** Days between two ISO dates, both counted. */
export function daysBetween(startDate?: string, endDate?: string): number | null {
  const start = startDate ? parts(startDate) : null;
  const end = endDate ? parts(endDate) : null;
  if (!start || !end) return null;
  const ms = Date.UTC(end.y, end.m, end.d) - Date.UTC(start.y, start.m, start.d);
  return ms < 0 ? null : Math.round(ms / 86_400_000) + 1;
}

/** "Sun 16 May" for trip day `day`, or "Day 3" without dates. */
export function dayName(day: number, startDate?: string): string {
  const start = startDate ? parts(startDate) : null;
  if (!start) return `Day ${day}`;
  const date = new Date(Date.UTC(start.y, start.m, start.d + day - 1));
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const AFTER = /speakeasy|cocktail/i;
const MAX_FEEL = 3;

/** "Ana loves cozy, intimate, lively places. Italian for dinner, a speakeasy after." Null without taste to speak of. */
export function tasteSentence(client: string, taste: OpeningFacts["taste"]): string | null {
  const names = [...new Set((taste ?? []).map((t) => t.name.trim()).filter(Boolean))];
  const feel = names.filter(isFeelWord).slice(0, MAX_FEEL).map((n) => n.toLowerCase());
  if (feel.length < 2) return null;
  const lead = `${client} loves ${feel.join(", ")} places.`;
  const cuisine = (taste ?? []).find((t) => t.type?.includes("cuisine") && !/^(european|cafe|cafes)$/i.test(t.name))?.name;
  const after = names.find((n) => AFTER.test(n));
  const dinner = cuisine ? `${cuisine} for dinner` : null;
  const later = after ? (/speakeasy/i.test(after) ? "a speakeasy after" : "cocktails after") : null;
  const tail = [dinner, later].filter(Boolean).join(", ");
  return tail ? `${lead} ${capitalize(tail)}.` : lead;
}

export function composeOpening(facts: OpeningFacts): ChatOpening {
  const client = firstName(facts.clientName);
  const who = joinNames(facts.travelerNames.length ? facts.travelerNames : [facts.clientName]);
  const range = dateRange(facts.startDate, facts.endDate);
  const created = [who, facts.destination, range].filter(Boolean).join(", ");
  const placeholder = `Tell me what ${client} wants from ${facts.destination}`;
  // Talk about the person first; the mechanics stay out of it.
  const known = facts.favoritesCount > 0 ? tasteSentence(client, facts.taste) : null;

  if (facts.filled.length > 0) {
    const count = facts.filled.length;
    const used = new Set(facts.filled.map((s) => s.day));
    const open = Array.from({ length: facts.dayCount }, (_, i) => i + 1).filter((d) => !used.has(d));
    const first = `${client}'s ${facts.destination} trip has ${numberWord(count)} ${count === 1 ? "place" : "places"} in the itinerary so far.`;
    const openLine =
      open.length === 0
        ? " Every day has at least one place."
        : open.length <= 4
          ? ` Nothing is planned yet on ${list(open.map((d) => dayName(d, facts.startDate)))}.`
          : ` ${capitalize(numberWord(open.length))} days have nothing planned yet.`;
    return { created, createdFrom: "From the new trip form", paragraphs: [...(known ? [known] : []), first + openLine, NEXT_QUESTION], placeholder };
  }

  const days = daysBetween(facts.startDate, facts.endDate);
  const lead = days ? `${capitalize(numberWord(days))} ${days === 1 ? "day" : "days"} in ${facts.destination} for ${who}.` : `A trip to ${facts.destination} for ${who}.`;
  if (known) return { created, createdFrom: "From the new trip form", paragraphs: [known, `${lead} ${BRIEF_QUESTION}`], placeholder };
  let match: string;
  if (facts.favoritesCount > 0) {
    const owners = list((facts.favoriteOwners?.length ? facts.favoriteOwners : [facts.clientName]).map((name) => `${firstName(name)}'s`));
    const favorites = `${numberWord(facts.favoritesCount)} ${facts.favoritesCount === 1 ? "favorite" : "favorites"}`;
    match =
      facts.advisorPlacesInCity > 0
        ? ` I will match every pick to ${owners} ${favorites} and check your ${numberWord(facts.advisorPlacesInCity)} saved ${facts.destination} ${facts.advisorPlacesInCity === 1 ? "place" : "places"} along the way.`
        : ` I will match every pick to ${owners} ${favorites}.`;
  } else {
    match = facts.savedFavorites
      ? ` None of ${client}'s favorites matched yet, so the matches stay broad until you check them on ${client}'s profile.`
      : ` ${client} has no favorites saved yet, so the matches stay broad until you add some to ${client}'s profile.`;
    if (facts.advisorPlacesInCity > 0) {
      match += ` I will check your ${numberWord(facts.advisorPlacesInCity)} saved ${facts.destination} ${facts.advisorPlacesInCity === 1 ? "place" : "places"} along the way.`;
    }
  }
  return { created, createdFrom: "From the new trip form", paragraphs: [lead + match, BRIEF_QUESTION], placeholder };
}
