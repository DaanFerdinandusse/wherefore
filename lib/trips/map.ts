import { z } from "zod";

import type {
  Ask,
  Category,
  ItinerarySlot,
  PlaceKeyword,
  SlotName,
  TravelerFavorite,
  TripPlaceSource,
  TripPlaceStatus,
} from "@/lib/contracts";
import type { itinerarySlots, tripAsks } from "@/lib/db/schema";

import { SLOT_ORDER } from "./day-parts";

// Pure row-to-contract mapping. The text columns hold closed sets; these
// narrow them once so the UI never sees a value outside the union.

const CATEGORIES: readonly Category[] = ["eat", "drink", "coffee", "see", "stay", "other"];
const SOURCES: readonly TripPlaceSource[] = ["seed", "ask", "advisor", "manual"];
const STATUSES: readonly TripPlaceStatus[] = ["suggested", "added", "removed"];
export { SLOT_ORDER };
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

/** The card facts in a places.properties block. Empty fields are left out. */
export function placeFactsFromProperties(properties: unknown): { keywords?: PlaceKeyword[]; dishes?: string[] } {
  const block = typeof properties === "object" && properties !== null ? (properties as Record<string, unknown>) : {};
  const keywords = cardKeywords(block.keywords);
  const dishes = cardDishes(block.specialty_dishes);
  return { ...(keywords.length > 0 ? { keywords } : {}), ...(dishes.length > 0 ? { dishes } : {}) };
}
