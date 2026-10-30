import { z } from "zod";

import type {
  Ask,
  Category,
  ItinerarySlot,
  PlaceFacts,
  PlaceKeyword,
  PlacePractical,
  SlotName,
  TravelerFavorite,
  TripPlaceSource,
  TripPlaceStatus,
} from "@/lib/contracts";
import type { itinerarySlots, tripAsks } from "@/lib/db/schema";
import type { FindPlacesInput, NormalizedPlace } from "@/lib/qloo/contracts";
import { WEEKDAY_NAMES } from "@/lib/qloo/normalize";

// Pure row-to-contract mapping. The text columns hold closed sets; these
// narrow them once so the UI never sees a value outside the union.

const CATEGORIES: readonly Category[] = ["eat", "drink", "coffee", "see", "stay", "other"];
const SOURCES: readonly TripPlaceSource[] = ["seed", "ask", "advisor", "manual"];
const STATUSES: readonly TripPlaceStatus[] = ["suggested", "added", "removed"];
export const SLOT_ORDER: readonly SlotName[] = ["morning", "lunch", "afternoon", "dinner", "night", "stay"];
const ASK_STATUSES: readonly Ask["status"][] = ["running", "done", "failed", "archived"];

function narrow<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export const asCategory = (value: string): Category => narrow(CATEGORIES, value, "other");
export const asSource = (value: string): TripPlaceSource => narrow(SOURCES, value, "seed");
export const asPlaceStatus = (value: string): TripPlaceStatus => narrow(STATUSES, value, "suggested");
export const asSlotName = (value: string): SlotName => narrow(SLOT_ORDER, value, "morning");
export const asAskStatus = (value: string): Ask["status"] => narrow(ASK_STATUSES, value, "running");

export function isSlotName(value: string): value is SlotName {
  return (SLOT_ORDER as readonly string[]).includes(value);
}

/**
 * `liveCount` is the number of ask_places rows, counted on read. The stored
 * `result_count` is only the final count written when the ask completes, so
 * it is the fallback, not the source.
 */
const AskTarget = z.object({ day: z.number().int().positive(), slot: z.enum(SLOT_ORDER) });

export function toAsk(row: typeof tripAsks.$inferSelect, liveCount?: number): Ask {
  const target = AskTarget.safeParse(row.target ?? row.query?.target);
  const pick = z.string().uuid().safeParse(row.query?.pick);
  return {
    ...(target.success ? { target: target.data } : {}),
    ...(pick.success ? { pickTripPlaceId: pick.data } : {}),
    id: row.id,
    label: row.label,
    status: asAskStatus(row.status),
    resultCount: liveCount ?? row.resultCount,
    elapsedMs: row.elapsedMs ?? undefined,
    toolCallId: row.toolCallId ?? undefined,
    loosened: row.loosened,
  };
}

export function toSlot(row: typeof itinerarySlots.$inferSelect): ItinerarySlot {
  return {
    id: row.id,
    day: row.day,
    date: row.date ?? undefined,
    slot: asSlotName(row.slot),
    tripPlaceId: row.tripPlaceId ?? undefined,
    note: row.note,
    // An agent note is never for the traveler, whatever the stored flag says.
    noteForTraveler: row.noteSource === "agent" ? false : row.noteForTraveler,
    ...(row.noteSource === "agent" ? { noteSource: "agent" as const } : {}),
    position: row.position,
  };
}

/** Day, then the slot's place in the day, then position. */
export function compareSlots(a: ItinerarySlot, b: ItinerarySlot): number {
  return (
    a.day - b.day ||
    SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) ||
    a.position - b.position
  );
}

/** "Lisbon for Ana": the destination and the client's first name. */
export function defaultTripTitle(destinationName: string, clientName: string): string {
  const first = clientName.trim().split(/\s+/)[0] || clientName.trim();
  return first ? `${destinationName} for ${first}` : destinationName;
}

// Place facts for the cards: what reviews mention and the place's own dishes,
// read from the provider's raw properties block (places.properties). Parsed
// leniently: a malformed entry is dropped, never guessed at.

/** How many review keywords a card carries, most mentioned first. */
export const CARD_KEYWORD_LIMIT = 8;
/** How many specialty dishes a card carries. */
export const CARD_DISH_LIMIT = 4;

const RawKeyword = z.object({ name: z.string().trim().min(1), count: z.number().int().nonnegative() });
// Specialty dishes come as tags ({ name, weight }); a plain string is accepted too.
const RawDish = z.union([
  z.string().trim().min(1),
  z.object({ name: z.string().trim().min(1), weight: z.number().optional() }),
]);

function parseList<T>(value: unknown, item: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const entry of value) {
    const parsed = item.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Review keywords with counts: one per name (case-insensitive), most mentioned first. */
export function cardKeywords(value: unknown, limit = CARD_KEYWORD_LIMIT): PlaceKeyword[] {
  const byName = new Map<string, PlaceKeyword>();
  for (const k of parseList(value, RawKeyword)) {
    const key = k.name.toLowerCase();
    const current = byName.get(key);
    if (!current || k.count > current.count) byName.set(key, { name: k.name, count: k.count });
  }
  return [...byName.values()]
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** The specialty dishes, verbatim, heaviest first when weighted, without repeats. */
export function cardDishes(value: unknown, limit = CARD_DISH_LIMIT): string[] {
  const dishes = parseList(value, RawDish).map((d, index) =>
    typeof d === "string" ? { name: d, weight: 0, index } : { name: d.name, weight: d.weight ?? 0, index },
  );
  dishes.sort((a, b) => b.weight - a.weight || a.index - b.index);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of dishes) {
    const key = d.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d.name);
  }
  return out.slice(0, limit);
}

const RawFavorite = z.object({
  name: z.string().trim().min(1),
  entityId: z.string().min(1).nullish(),
  imageUrl: z.string().min(1).nullish(),
});

/** A client's favorites as the snapshot query aggregates them; blanks dropped, nulls left out. */
export function travelerFavorites(value: unknown): TravelerFavorite[] {
  return parseList(value, RawFavorite).map((f) => ({
    name: f.name,
    ...(f.entityId ? { entityId: f.entityId } : {}),
    ...(f.imageUrl ? { imageUrl: f.imageUrl } : {}),
  }));
}

/** 1 to 4, or undefined. */
export function cardPriceLevel(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4 ? value : undefined;
}

/** A popularity percentile from 0 to 1, or undefined. */
export function cardPopularity(value: unknown): number | undefined {
  return typeof value === "number" && value >= 0 && value <= 1 ? value : undefined;
}

/**
 * Does the provider link the place to Michelin? external.michelin is a list of
 * { id, stars } in /v2/insights and one { id } in /search and /entities. Stars
 * are often null, so the key means listed, never starred.
 */
export function cardMichelin(external: unknown): boolean {
  if (typeof external !== "object" || external === null) return false;
  const value = (external as Record<string, unknown>).michelin;
  const refs: unknown[] = Array.isArray(value) ? value : [value];
  return refs.some((ref) => {
    const id = typeof ref === "object" && ref !== null ? (ref as Record<string, unknown>).id : undefined;
    return (typeof id === "string" && id !== "") || typeof id === "number";
  });
}

/** The card facts in a places.properties block. Empty fields are left out. */
export function placeFactsFromProperties(properties: unknown): {
  keywords?: PlaceKeyword[];
  dishes?: string[];
  popularity?: number;
  michelin?: boolean;
} {
  const block = typeof properties === "object" && properties !== null ? (properties as Record<string, unknown>) : {};
  const keywords = cardKeywords(block.keywords);
  const dishes = cardDishes(block.specialty_dishes);
  const popularity = cardPopularity(block.popularity);
  return {
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(dishes.length > 0 ? { dishes } : {}),
    ...(popularity !== undefined ? { popularity } : {}),
    ...(cardMichelin(block.external) ? { michelin: true } : {}),
  };
}

/** A business rating above 0 up to 5, or undefined. */
export function cardRating(value: unknown): number | undefined {
  return typeof value === "number" && value > 0 && value <= 5 ? value : undefined;
}

/** The provider's description fields of a place, in the order they are worth reading. */
export const DESCRIPTION_KEYS = [
  "short_description",
  "description",
  "overall_description",
  "ambience_description",
  "cuisine_description",
  "unique_selling_points",
  "neighborhood_description",
  "physical_setting_description",
] as const;

/** Every description text of a places row, the short ones first. Verbatim, nothing added. */
export function descriptionTexts(row: { description: string | null; properties: Record<string, unknown> }): string[] {
  const texts = [
    ...DESCRIPTION_KEYS.map((key) => row.properties[key]),
    row.description,
  ].flatMap((value) => (typeof value === "string" && value.trim() ? [value.trim()] : []));
  return [...new Set(texts)];
}

/** How long the card's one description may be. */
export const CARD_ABOUT_LIMIT = 200;

/**
 * One short description, verbatim: the whole text when it fits, else its first
 * sentences, else cut at a word and marked with an ellipsis.
 */
export function cardAbout(value: unknown, limit = CARD_ABOUT_LIMIT): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentenceEnd >= limit / 2) return head.slice(0, sentenceEnd + 1);
  const room = text.slice(0, limit - 1);
  const wordEnd = room.lastIndexOf(" ");
  return `${room.slice(0, wordEnd > 0 ? wordEnd : room.length).replace(/[\s,;:]+$/, "")}…`;
}

/**
 * The tag families a card reads as practical facts, the ones a ground rule
 * hinges on most first: when a place has more than the limit, the last
 * families go, so a dietary or access fact is never the one that is cut.
 */
export const PRACTICAL_FAMILIES: readonly { key: keyof PlacePractical; type: string }[] = [
  { key: "dietary", type: "urn:tag:dietary_option:qloo" },
  { key: "accessibility", type: "urn:tag:accessibility:place" },
  { key: "children", type: "urn:tag:children:place" },
  { key: "noise", type: "urn:tag:noise_level:qloo" },
  { key: "planning", type: "urn:tag:planning:place" },
  { key: "occasion", type: "urn:tag:event:place" },
  { key: "visit", type: "urn:tag:visit_intent:qloo" },
];
/** How many practical facts a card carries at most. A busy place has about 20. */
export const CARD_PRACTICAL_LIMIT = 24;
/** The same families as a jsonpath over places.tags, so the card query leaves the other 100 tags in the database. */
export const PRACTICAL_TAGS_PATH = `$[*] ? (${PRACTICAL_FAMILIES.map((f) => `@.type == "${f.type}"`).join(" || ")})`;

const RawTag = z.object({ name: z.string().trim().min(1), type: z.string() });

/** A place's tags as practical facts by family, verbatim. Undefined when there are none. */
export function cardPractical(tags: unknown, limit = CARD_PRACTICAL_LIMIT): PlacePractical | undefined {
  const parsed = parseList(tags, RawTag);
  const out: PlacePractical = {};
  let left = limit;
  for (const { key, type } of PRACTICAL_FAMILIES) {
    const names = [...new Set(parsed.filter((t) => t.type === type).map((t) => t.name))].slice(0, left);
    if (names.length === 0) continue;
    out[key] = names;
    left -= names.length;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The facts a choice rests on beyond the properties block. Empty fields are left out. */
export function choiceFacts(input: { rating: unknown; about: unknown; tags: unknown }): Pick<PlaceFacts, "rating" | "about" | "practical"> {
  const rating = cardRating(input.rating);
  const about = cardAbout(input.about);
  const practical = cardPractical(input.tags);
  return {
    ...(rating !== undefined ? { rating } : {}),
    ...(about ? { about } : {}),
    ...(practical ? { practical } : {}),
  };
}

/** The facts of a place that may not be on the board (score_places), the same ones a card carries. */
export function placeFactsOf(
  place: Pick<NormalizedPlace, "properties" | "tags" | "description" | "rating" | "priceLevel">,
): PlaceFacts {
  const priceLevel = cardPriceLevel(place.priceLevel);
  return {
    ...placeFactsFromProperties(place.properties),
    ...choiceFacts({ rating: place.rating, about: descriptionTexts(place)[0], tags: place.tags }),
    ...(priceLevel ? { priceLevel } : {}),
  };
}

/** The search options of an ask that a rerun of it must keep. */
export type AskFilters = Pick<FindPlacesInput, "popularityMax" | "michelin" | "openDay">;

/** The search options stored on an ask's query (find_places writes them). */
export function askFiltersOfQuery(query: Record<string, unknown>): AskFilters {
  const popularityMax = cardPopularity(query.popularityMax);
  const openDay = WEEKDAY_NAMES.find((day) => day === query.openDay);
  return {
    ...(popularityMax !== undefined ? { popularityMax } : {}),
    ...(query.michelin === true ? { michelin: true } : {}),
    ...(openDay ? { openDay } : {}),
  };
}

/** The point and radius of an ask's area, once it resolved inside the destination. */
export type AskArea = { lat: number; lon: number; radiusM: number };

/** What a rerun of an ask keeps. `tags` is empty when the ask has none: the caller uses the category. */
export type AskRerun = AskFilters & { tags: string[]; priceMax?: number; area?: AskArea };

const AskAreaSchema = z.object({ lat: z.number(), lon: z.number(), radiusM: z.number().positive() });

/** Tag ids only: the tags the advisor typed are words, and the upstream filter takes ids. */
function tagIdsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string" && tag.startsWith("urn:tag:")) : [];
}

/**
 * The one reader of an ask's stored search, so remove_place and the UI's
 * replace rerun the same thing: the tag ids it searched on, its price cap, its
 * area and its search options.
 */
export function askRerunOfQuery(query: Record<string, unknown>): AskRerun {
  const resolved = tagIdsOf(query.resolvedTags);
  const price = query.priceMax ?? query.price;
  const area = AskAreaSchema.safeParse(query.resolvedArea);
  return {
    tags: resolved.length > 0 ? resolved : tagIdsOf(query.tags),
    ...(typeof price === "number" && price >= 1 && price <= 4 ? { priceMax: price } : {}),
    ...(area.success ? { area: area.data } : {}),
    ...askFiltersOfQuery(query),
  };
}
