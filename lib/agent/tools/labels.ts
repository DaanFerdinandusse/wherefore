import type { Category } from "@/lib/contracts";

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

/** "1.4 s" from milliseconds. */
export function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}
