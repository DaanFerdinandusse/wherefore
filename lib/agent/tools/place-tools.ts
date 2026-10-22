import "server-only";

import { eq, sql } from "drizzle-orm";
import { FatalError } from "workflow";

import type {
  Category,
  LookupPlaceOutput,
  RemovePlaceOutput,
  SetItineraryOutput,
  SlotName,
} from "@/lib/contracts";
import { db } from "@/lib/db";
import { askPlaces, places, tripAsks, tripPlaces } from "@/lib/db/schema";
import {
  CATEGORY_FILTER_TAGS,
  findPlaces,
  QlooLocalityMismatchError,
  type PlaceResult,
} from "@/lib/qloo";
import { setSlots, setTripPlaceStatus, type SlotInput } from "@/lib/trips";

import { guarded, type TurnRef } from "../writes";

import { cardsInOrder, persistAskPlaces, persistBoardItems, resolveTripPlaceIds, type BoardItem } from "./search-core";
import { loadToolTrip, logCalls } from "./trip-data";

// lookup_place, set_itinerary and remove_place: the small tools.

// ------------------------------------------------------------ lookup_place

const DESCRIPTION_KEYS = [
  "short_description",
  "description",
  "overall_description",
  "ambience_description",
  "cuisine_description",
  "unique_selling_points",
  "neighborhood_description",
  "physical_setting_description",
] as const;
const MAX_DESCRIPTION = 400;
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** "18:30 to 23:00", "closed", from the provider's hours block. */
export function hoursOf(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const day of DAYS) {
    const spans = (raw as Record<string, unknown>)[day];
    if (!Array.isArray(spans) || spans.length === 0) continue;
    const parts = spans.flatMap((span) => {
      if (!span || typeof span !== "object") return [];
      const s = span as { opens?: unknown; closes?: unknown; closed?: unknown };
      if (s.closed === true) return ["closed"];
      const opens = typeof s.opens === "string" ? s.opens.replace(/^T/, "").slice(0, 5) : undefined;
      const closes = typeof s.closes === "string" ? s.closes.replace(/^T/, "").slice(0, 5) : undefined;
      return opens && closes ? [`${opens} to ${closes}`] : [];
    });
    if (parts.length > 0) out[day] = [...new Set(parts)].join(", ");
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The trimmed properties block of a `places` row. Nothing is added. */
export function lookupFromRow(row: typeof places.$inferSelect, tripPlaceId?: string): LookupPlaceOutput {
  const p = row.properties;
  const descriptions = DESCRIPTION_KEYS.map((key) => text(p[key]))
    .filter((d): d is string => !!d)
    .filter((d, i, all) => all.indexOf(d) === i)
    .map((d) => clip(d, MAX_DESCRIPTION));
  const keywords = Array.isArray(p.keywords)
    ? p.keywords
        .map((k) => (k && typeof k === "object" && "name" in k ? text((k as { name: unknown }).name) : text(k)))
        .filter((k): k is string => !!k)
        .slice(0, 15)
    : undefined;
  return {
    placeId: row.id,
    ...(tripPlaceId ? { tripPlaceId } : {}),
    name: row.name,
    ...(row.address ? { address: row.address } : {}),
    ...(row.neighborhood ? { neighborhood: row.neighborhood } : {}),
    ...(row.priceLevel !== null ? { priceLevel: row.priceLevel } : {}),
    ...(row.rating !== null ? { rating: row.rating } : {}),
    ...(row.description ? { description: clip(row.description, MAX_DESCRIPTION) } : {}),
    ...(descriptions.length ? { descriptions } : {}),
    ...(keywords?.length ? { keywords } : {}),
    tags: row.tags.map((t) => t.name).slice(0, 25),
    ...(hoursOf(p.hours) ? { hours: hoursOf(p.hours) } : {}),
    ...(text(p.website) ? { website: text(p.website) } : {}),
    ...(text(p.phone) ? { phone: text(p.phone) } : {}),
  };
}

export async function lookupPlaceTool(input: { place_id: string }, turn: TurnRef): Promise<LookupPlaceOutput> {
  const found = (await resolveTripPlaceIds(turn.tripId, [input.place_id])).get(input.place_id);
  if (!found) {
    return { placeId: input.place_id, name: "", tags: [], error: "That place is not on this trip." };
  }
  const [row] = await db.select().from(places).where(eq(places.id, found.placeId)).limit(1);
  if (!row) return { placeId: found.placeId, name: "", tags: [], error: "No facts are stored for this place." };
  return lookupFromRow(row, found.id);
}

// ----------------------------------------------------------- set_itinerary

export type SetItineraryInput = {
  days: { day: number; slots: { slot: SlotName; place_id: string; note?: string }[] }[];
  mode: "replace" | "merge";
};

export async function setItineraryTool(input: SetItineraryInput, turn: TurnRef): Promise<SetItineraryOutput> {
  const ctx = await loadToolTrip(turn.tripId);
  const asked = input.days.flatMap((d) => d.slots.map((s) => ({ day: d.day, ...s })));
  const known = await resolveTripPlaceIds(
    turn.tripId,
    asked.map((s) => s.place_id),
  );
  const rejected: SetItineraryOutput["rejected"] = [];
  const slots: SlotInput[] = [];
  const positions = new Map<string, number>();
  for (const s of asked) {
    const row = known.get(s.place_id);
    if (!row) {
      rejected.push({ placeId: s.place_id, reason: "This place is not on this trip." });
      continue;
    }
    if (row.status === "removed") {
      rejected.push({ placeId: s.place_id, reason: "This place was removed from the trip." });
      continue;
    }
    const key = `${s.day}|${s.slot}`;
    const position = positions.get(key) ?? 0;
    positions.set(key, position + 1);
    slots.push({ day: s.day, slot: s.slot, tripPlaceId: row.id, note: s.note ?? "", position });
  }
  if (slots.length === 0 && input.mode !== "replace") return { applied: [], rejected };
  const result = await guarded(turn, () => setSlots(turn.tripId, slots, input.mode, ctx.scope));
  return {
    applied: result.applied,
    rejected: [...rejected, ...result.rejected.map((r) => ({ placeId: r.tripPlaceId, reason: r.reason }))],
  };
}

// ------------------------------------------------------------ remove_place

/**
 * The next best place for the one removed: the originating ask (its stored
 * query) or the place's category, rerun with every place on the trip
 * excluded. Implemented here because lib/trips/replace.ts has not merged.
 */
export async function removePlaceTool(
  input: { place_id: string; replace: boolean },
  turn: TurnRef,
): Promise<RemovePlaceOutput> {
  const ctx = await loadToolTrip(turn.tripId);
  const found = (await resolveTripPlaceIds(turn.tripId, [input.place_id])).get(input.place_id);
  if (!found) return { error: "That place is not on this trip." };
  const [placeRow] = await db.select().from(places).where(eq(places.id, found.placeId)).limit(1);
  await guarded(turn, () => setTripPlaceStatus(found.id, "removed", ctx.scope));
  const removed = {
    tripPlaceId: found.id,
    placeId: found.placeId,
    name: placeRow?.name ?? "",
    category: found.category as Category,
  };
  if (!input.replace) return { removed };

  // Where the place came from: its best ranked ask, else its category.
  const [origin] = await db
    .select({ askId: tripAsks.id, query: tripAsks.query })
    .from(askPlaces)
    .innerJoin(tripAsks, eq(tripAsks.id, askPlaces.askId))
    .where(eq(askPlaces.tripPlaceId, found.id))
    .orderBy(askPlaces.rank)
    .limit(1);
  const query = origin?.query ?? {};
  const tags =
    Array.isArray(query.resolvedTags) && query.resolvedTags.every((t) => typeof t === "string")
      ? (query.resolvedTags as string[])
      : removed.category !== "other"
        ? CATEGORY_FILTER_TAGS[removed.category]
        : [];
  const priceMax = typeof query.priceMax === "number" ? query.priceMax : undefined;

  const onTrip = await db
    .select({ entityId: places.entityId })
    .from(places)
    .innerJoin(tripPlaces, eq(tripPlaces.placeId, places.id))
    .where(eq(tripPlaces.tripId, turn.tripId));
  const excludeIds = onTrip.map((r) => r.entityId).slice(0, 200);

  let results: PlaceResult[];
  try {
    const result = await findPlaces(
      {
        destination: ctx.destination,
        signals: ctx.signals.signals,
        ...(tags.length ? { tags, tagsOperator: "union" as const } : {}),
        ...(priceMax ? { priceMax } : {}),
        excludeIds,
        take: 5,
      },
      { tripId: ctx.trip.id },
    );
    await logCalls(turn, ctx, result.calls, origin ? `ask:${origin.askId}` : "manual", result.loosened);
    results = result.results;
  } catch (error) {
    if (error instanceof QlooLocalityMismatchError) return { removed, note: "No replacement: the search came back from another city." };
    throw new FatalError(`Removed ${removed.name}, but the search for a replacement did not answer. Ask again for one.`);
  }
  const pick =
    results.find((r) => removed.category === "other" || r.category === removed.category) ?? results[0];
  if (!pick) return { removed, note: "No other place matched, so nothing replaced it." };

  const item: BoardItem = {
    place: pick.place,
    category: pick.category,
    affinity: pick.affinity,
    score: pick.score,
    signalScores: pick.signalScores,
    source: origin ? "ask" : "seed",
  };
  const ids = await persistBoardItems(turn, ctx, [item]);
  const tripPlaceId = ids.get(pick.place.entityId);
  if (!tripPlaceId) return { removed, note: "The replacement could not be saved." };
  if (origin) {
    // Joins the same ask tab, after the existing results.
    const [last] = await db
      .select({ rank: sql<number>`max(${askPlaces.rank})::int` })
      .from(askPlaces)
      .where(eq(askPlaces.askId, origin.askId));
    await persistAskPlaces(turn, ctx, origin.askId, [{ tripPlaceId, item }], (last?.rank ?? 0) + 1);
  }
  const [replacement] = await cardsInOrder(ctx, [tripPlaceId]);
  return { removed, ...(replacement ? { replacement } : {}) };
}
