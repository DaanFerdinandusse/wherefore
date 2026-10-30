import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
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
  WEEKDAY_NAMES,
  type PlaceResult,
} from "@/lib/qloo";
import { upsertPlaces } from "@/lib/places";
import { saveReplacement, setSlots, setTripPlaceStatus, type SlotInput } from "@/lib/trips";
import { askFiltersOfQuery, DESCRIPTION_KEYS, descriptionTexts } from "@/lib/trips/map";

import { cacheWrite, guarded, type TurnRef } from "../writes";

import { replacementNote } from "./labels";
import { cleanAgentNote } from "./notes";
import {
  cardsInOrder,
  driversOf,
  resolveTripPlaceIds,
  tripPlaceRowOf,
  type BoardItem,
} from "./search-core";
import { searchExclusions } from "./signals";
import { loadToolTrip, logCalls } from "./trip-data";

// lookup_place, set_itinerary and remove_place: the small tools.

// ------------------------------------------------------------ lookup_place

const MAX_DESCRIPTION = 400;

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
  for (const day of WEEKDAY_NAMES) {
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

/**
 * What a model note about a place may quote: the place's descriptions and
 * its opening hours, verbatim (notes.ts). Never its tags: a sentence passes
 * when it contains a fact, so a short name ("Accepts reservations") would
 * carry any invented hours or price written around it.
 */
export function noteFactsOf(row: Pick<typeof places.$inferSelect, "description" | "properties">): string[] {
  return [...descriptionTexts(row), ...Object.values(hoursOf(row.properties.hours) ?? {})];
}

async function noteFacts(placeIds: string[]): Promise<Map<string, string[]>> {
  if (placeIds.length === 0) return new Map();
  const rows = await db.select().from(places).where(inArray(places.id, [...new Set(placeIds)]));
  return new Map(rows.map((row) => [row.id, noteFactsOf(row)]));
}

export async function setItineraryTool(
  input: SetItineraryInput,
  turn: TurnRef,
  toolCallId: string,
): Promise<SetItineraryOutput> {
  void toolCallId; // Slots are keyed by (trip, day, slot, position): a retry writes the same rows.
  const ctx = await loadToolTrip(turn.tripId);
  const asked = input.days.flatMap((d) => d.slots.map((s) => ({ day: d.day, ...s })));
  const known = await resolveTripPlaceIds(
    turn.tripId,
    asked.map((s) => s.place_id),
  );
  const facts = await noteFacts([...known.values()].map((row) => row.placeId));
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
    // The model's note is an agent note: for the advisor only, never shown
    // to the traveler, and stripped of hours, prices and reservations it
    // can not quote from the place's facts.
    const note = cleanAgentNote(s.note, facts.get(row.placeId) ?? []);
    slots.push({ day: s.day, slot: s.slot, tripPlaceId: row.id, note, noteSource: "agent", noteForTraveler: false, position });
  }
  if (slots.length === 0 && input.mode !== "replace") return { applied: [], rejected };
  const result = await guarded(turn, (guard) => setSlots(turn.tripId, slots, input.mode, ctx.scope, { turn: guard }));
  return {
    applied: result.applied,
    rejected: [...rejected, ...result.rejected.map((r) => ({ placeId: r.tripPlaceId, reason: r.reason }))],
  };
}

// ------------------------------------------------------------ remove_place

/**
 * The next best place for the one removed: the originating ask (its stored
 * query) or the place's category, rerun with every place on the trip
 * excluded. Idempotent by toolCallId: the replacement is saved together with
 * a link on the removed place (replaced_by, replacement_key), so a retried
 * step finds it and returns the same replacement instead of adding another.
 */
export async function removePlaceTool(
  input: { place_id: string; replace: boolean },
  turn: TurnRef,
  toolCallId: string,
): Promise<RemovePlaceOutput> {
  const before = await loadToolTrip(turn.tripId);
  const found = (await resolveTripPlaceIds(turn.tripId, [input.place_id])).get(input.place_id);
  if (!found) return { error: "That place is not on this trip." };
  const [placeRow] = await db.select().from(places).where(eq(places.id, found.placeId)).limit(1);
  const removed = {
    tripPlaceId: found.id,
    placeId: found.placeId,
    name: placeRow?.name ?? "",
    category: found.category as Category,
  };

  // Already replaced: by this call (a retry) or an earlier one.
  if (found.status === "removed" && found.replacedBy) {
    const [replacement] = await cardsInOrder(before, [found.replacedBy]);
    return {
      removed,
      ...(replacement ? { replacement } : {}),
      ...(found.replacementKey === toolCallId ? {} : { note: "This place was already removed and replaced earlier." }),
    };
  }
  if (found.status !== "removed") {
    await guarded(turn, (guard) => setTripPlaceStatus(found.id, "removed", before.scope, { turn: guard }));
  }
  if (!input.replace) return { removed };
  // Read again after the removal: a place the advisor just dropped from the
  // itinerary is no longer a pick, so the replacement is not searched for on it.
  const ctx = await loadToolTrip(turn.tripId);

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
  const filters = askFiltersOfQuery(query);

  const onTrip = await db
    .select({ entityId: places.entityId })
    .from(places)
    .innerJoin(tripPlaces, eq(tripPlaces.placeId, places.id))
    .where(eq(tripPlaces.tripId, turn.tripId));
  const excludeIds = searchExclusions(onTrip.map((r) => r.entityId));

  let results: PlaceResult[];
  let note: string | undefined;
  try {
    const result = await findPlaces(
      {
        destination: ctx.destination,
        signals: ctx.signals.signals,
        ...(tags.length ? { tags, tagsOperator: "union" as const } : {}),
        ...(priceMax ? { priceMax } : {}),
        ...filters,
        excludeIds,
        take: 5,
      },
      { tripId: ctx.trip.id },
    );
    await logCalls(turn, ctx, result.calls, origin ? `ask:${origin.askId}` : "manual", { toolCallId, step: "replace" }, result.loosened);
    results = result.results;
    note = replacementNote(result.loosened, filters.openDay);
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
  const placeIds = await cacheWrite(turn, () => upsertPlaces([pick.place]));
  const placeId = placeIds[pick.place.entityId];
  if (!placeId) return { removed, note: "The replacement could not be saved." };
  // Joins the same ask tab, after the existing results.
  const lastRank = origin
    ? ((
        await db
          .select({ rank: sql<number>`max(${askPlaces.rank})::int` })
          .from(askPlaces)
          .where(eq(askPlaces.askId, origin.askId))
      )[0]?.rank ?? 0)
    : 0;
  const row = tripPlaceRowOf(ctx, item, placeId);
  const tripPlaceId = await guarded(turn, (guard) =>
    saveReplacement(
      turn.tripId,
      {
        removedTripPlaceId: found.id,
        key: toolCallId,
        place: row,
        ...(origin
          ? {
              ask: {
                askId: origin.askId,
                rank: lastRank + 1,
                affinity: row.bestAffinity,
                score: row.bestScore,
                explainability: driversOf(ctx, item.signalScores),
              },
            }
          : {}),
      },
      ctx.scope,
      { turn: guard },
    ),
  );
  if (!tripPlaceId) return { removed, note: "The replacement could not be saved." };
  const [replacement] = await cardsInOrder(ctx, [tripPlaceId]);
  return { removed, ...(replacement ? { replacement, ...(note ? { note } : {}) } : {}) };
}
