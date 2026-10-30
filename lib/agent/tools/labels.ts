import type { Category, SlotName, SlotTarget } from "@/lib/contracts";

// Words the tools and the tool cards share: ask labels ("Natural wine · Sat"),
// card titles ("Searched natural wine bars"), category phrases and loosened
// filters in plain words. Pure; safe in client components.

export type SearchCategory = Exclude<Category, "other">;

export const SEED_CATEGORIES: SearchCategory[] = ["eat", "drink", "coffee", "see", "stay"];

/** "places to eat", for progress lines and the seed card. */
export const CATEGORY_PHRASE: Record<Category, string> = {
  eat: "places to eat",
  drink: "places to drink",
  coffee: "coffee",
  see: "things to see",
  stay: "places to stay",
  other: "other places",
};

/** Board tab names. */
export const CATEGORY_NAME: Record<Category, string> = {
  eat: "Eat",
  drink: "Drink",
  coffee: "Coffee",
  see: "See",
  stay: "Stay",
  other: "Other",
};

const WEEKDAYS: Record<string, string> = {
  monday: "Mon",
  mon: "Mon",
  tuesday: "Tue",
  tue: "Tue",
  tues: "Tue",
  wednesday: "Wed",
  wed: "Wed",
  thursday: "Thu",
  thu: "Thu",
  thurs: "Thu",
  friday: "Fri",
  fri: "Fri",
  saturday: "Sat",
  sat: "Sat",
  sunday: "Sun",
  sun: "Sun",
};

const MAX_INTENT_CHARS = 28;
const MAX_DAY_CHARS = 14;

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0]!.toUpperCase() + text.slice(1) : text;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : text.slice(0, max)).trim();
}

/** "Saturday night" -> "Sat night", "day 2" -> "Day 2", "" -> "". */
export function shortDay(dayHint: string | undefined): string {
  const text = squash(dayHint ?? "").replace(/[.,;:]+$/, "");
  if (!text) return "";
  const words = text.split(" ");
  const first = words[0]!.toLowerCase();
  const weekday = WEEKDAYS[first];
  if (weekday) return clip([weekday, ...words.slice(1).map((w) => w.toLowerCase())].join(" "), MAX_DAY_CHARS);
  return clip(capitalize(text), MAX_DAY_CHARS);
}

/**
 * The intent without a trailing day phrase the model left in it:
 * "natural wine bars for Saturday" -> "natural wine bars".
 */
export function cleanIntent(intent: string, dayHint?: string): string {
  let text = squash(intent).replace(/[.?!]+$/, "");
  const day = squash(dayHint ?? "");
  if (day) {
    const escaped = day.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\s+(?:for|on|this|next)?\\s*${escaped}$`, "i"), "");
  }
  text = text.replace(/\s+(?:for|on)\s+(?:mon|tues?|wednes|thurs?|fri|satur|sun)(?:day)?(?:\s+(?:night|evening|morning|lunch))?$/i, "");
  return squash(text);
}

/** The board and map tab of an ask: "Natural wine bars · Sat". */
export function askLabel(intent: string, dayHint?: string): string {
  const what = clip(capitalize(cleanIntent(intent, dayHint)), MAX_INTENT_CHARS) || "Your ask";
  const day = shortDay(dayHint);
  return day ? `${what} · ${day}` : what;
}

/** The search card title: "Searched natural wine bars" (running: "Searching ..."). */
export function searchTitle(intent: string, running: boolean, dayHint?: string): string {
  const what = cleanIntent(intent, dayHint) || "places";
  const lower = what === what.toUpperCase() ? what : what[0]!.toLowerCase() + what.slice(1);
  return `${running ? "Searching" : "Searched"} ${lower}`;
}

/** find_places filled few exact matches with other places of the asked category. */
export const WIDENED_IN_CATEGORY = "widened_in_category";

/** Loosened filter codes from the search, in the words the card and the model use. */
export const LOOSENED_COPY: Record<string, string> = {
  tags: "Widened beyond the category to find enough places",
  price: "Price cap dropped to find enough places",
  price_not_applicable: "Price cap not applied to museums and hotels",
  [WIDENED_IN_CATEGORY]: "Few exact matches, so the rest are other places of the same kind",
};

export function loosenedCopy(loosened: readonly string[]): string[] {
  return loosened.map((code) => LOOSENED_COPY[code]).filter((text): text is string => Boolean(text));
}

/** "Lisbon · near Príncipe Real · based on Ana's favorites". */
export function searchDetails(parts: { destination: string; area?: string; basedOn?: string }): string {
  return [parts.destination, parts.area ? `near ${squash(parts.area)}` : undefined, parts.basedOn]
    .filter((p): p is string => Boolean(p))
    .join(" · ");
}

/** "Ana's favorites", "Ana's and Marcus's favorites", or undefined without any. */
export function basedOnFavorites(names: readonly string[]): string | undefined {
  const firsts = names.map((n) => n.split(" ")[0] ?? n).filter(Boolean);
  if (firsts.length === 0) return undefined;
  const possessive = firsts.map((n) => `${n}'s`);
  const joined =
    possessive.length === 1 ? possessive[0] : `${possessive.slice(0, -1).join(", ")} and ${possessive.at(-1)}`;
  return `based on ${joined} favorites`;
}

// ------------------------------------------------------- slots and search rows

const SLOT_WORDS: Record<SlotName, string> = {
  morning: "morning",
  lunch: "lunch",
  afternoon: "afternoon",
  dinner: "dinner",
  night: "late",
  stay: "stay",
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** The ISO date of trip day `day` (1 based), when the trip has a start date. */
export function dateOfDay(startDate: string | undefined, day: number): string | undefined {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) return undefined;
  const [y, m, d] = startDate.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + day - 1));
  return date.toISOString().slice(0, 10);
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/**
 * A slot as a button and chip label: "Fri dinner", "Day 2 lunch" without
 * dates, "Lisbon stay" for the stay slot.
 */
export function slotTarget(
  input: { day: number; slot: SlotName },
  trip: { startDate?: string; destinationName?: string },
): SlotTarget {
  const date = dateOfDay(trip.startDate, input.day);
  let label: string;
  if (input.slot === "stay") label = trip.destinationName ? `${trip.destinationName} stay` : "Stay";
  else if (date) label = `${WEEKDAY_SHORT[weekdayOf(date)]} ${SLOT_WORDS[input.slot]}`;
  else label = `Day ${input.day} ${SLOT_WORDS[input.slot]}`;
  return { day: input.day, slot: input.slot, label, ...(date ? { date } : {}) };
}

/** A slot inside a sentence: "Friday dinner", "day 2 lunch", "the stay". */
export function slotPhrase(target: Pick<SlotTarget, "day" | "slot" | "date">): string {
  if (target.slot === "stay") return "the stay";
  const word = target.slot === "night" ? "late" : SLOT_WORDS[target.slot];
  if (target.date) return `${WEEKDAY_LONG[weekdayOf(target.date)]} ${word}`;
  return `day ${target.day} ${word}`;
}

const NOUNS: Record<Category, [string, string]> = {
  eat: ["restaurant", "restaurants"],
  drink: ["bar", "bars"],
  coffee: ["cafe", "cafes"],
  see: ["place to see", "places to see"],
  stay: ["hotel", "hotels"],
  other: ["place", "places"],
};

/** "restaurants", "bar": the noun of a search row for a category. */
export function categoryNoun(category: Category | undefined, count: number): string {
  const [one, many] = NOUNS[category ?? "other"];
  return count === 1 ? one : many;
}

/**
 * The search row title. Before any place is back: "Looking for restaurants
 * for Friday dinner"; with places, running: "Looking at 5 restaurants for
 * Friday dinner"; done: "Looked at 5 restaurants for Friday dinner".
 */
export function rowTitle(input: {
  phase: "pending" | "running" | "done";
  count: number;
  category?: Category;
  target?: Pick<SlotTarget, "day" | "slot" | "date">;
  dayHint?: string;
}): string {
  const when = input.target ? ` for ${slotPhrase(input.target)}` : input.dayHint?.trim() ? ` for ${squash(input.dayHint)}` : "";
  if (input.phase === "pending") return `Looking for ${categoryNoun(input.category, 2)}${when}`;
  const noun = categoryNoun(input.category, input.count);
  return `${input.phase === "done" ? "Looked" : "Looking"} at ${input.count} ${noun}${when}`;
}

/** The advisor's words as row chips: tags first, else the intent without its category noun. Lower case, at most 4. */
export function searchTerms(tags: readonly string[] | undefined, intentText: string): string[] {
  const raw = tags && tags.length > 0 ? tags : intentText ? intentText.split(/,|\band\b/) : [];
  const out: string[] = [];
  for (const term of raw) {
    const clean = squash(term).toLowerCase();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out.slice(0, 4);
}

/** "1.4 s" from milliseconds. */
export function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}
