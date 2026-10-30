import "server-only";

import { eq, inArray } from "drizzle-orm";
import { FatalError } from "workflow";
import { z } from "zod";

import type { Category, FindPlacesOutput, PlacePreview, PlaceVerdict, SlotName, SlotTarget, ToolStep, TripPlaceCard, Weekday } from "@/lib/contracts";
import { db } from "@/lib/db";
import { places, tripAsks } from "@/lib/db/schema";
import { MAP_REGION_LABEL } from "@/lib/map/region-prompt";
import { createAsk, updateAsk } from "@/lib/trips";
import {
  categoryOf,
  CATEGORY_FILTER_TAGS,
  closedOn,
  displayScore,
  findPlaces,
  findTags,
  haversineM,
  LESS_KNOWN_POPULARITY_MAX,
  openDuring,
  QlooLocalityMismatchError,
  resolveLocality,
  WEEKDAY_NAMES,
  type FindPlacesResult,
  type NormalizedPlace,
  type PlaceResult,
  type QlooCall,
} from "@/lib/qloo";
import { placeFactsFromProperties, type AskFilters } from "@/lib/trips/map";

import { agentModelRef, agentProviderOptions } from "@/lib/codex/provider";

import { carryTags } from "../taste-overlap";
import { dealScores, mergeVerdicts, settleVerdicts, verdictOrder, weighPlaces, type MoreSearch, type WeighBrief, type WeighPlace } from "../weigh";
import { assertTurn, finishAsk, guarded, TurnSupersededError, writeScores, type TurnRef } from "../writes";

import {
  askLabel,
  basedOnFavorites,
  categoryNoun,
  cleanIntent,
  openDayOf,
  rowTitle,
  searchDetails,
  searchTerms,
  seconds,
  slotTarget,
  WIDENED_IN_CATEGORY,
  type SearchCategory,
} from "./labels";
import { factsForModel } from "./model-output";
import { hoursOf } from "./place-tools";
import { pause, withProgress } from "./run-tool";
import { chooseSearchArea, searchedAreaText, widenedNote, type SearchAreaInput } from "./search-area";
import {
  cardsInOrder,
  explainCards,
  persistAskPlaces,
  persistBoardItems,
  rankedOf,
  scoreAdvisorPlaces,
  tripPlaceSpot,
  type BoardItem,
  type RankedPlace,
} from "./search-core";
import { searchExclusions } from "./signals";
import { firstName, loadPlacedPoints, loadToolTrip, logCalls, type ToolTrip } from "./trip-data";

// find_places (PLAN 7): one ask from the advisor becomes one board and map
// tab. Three phases, each yielded as a preliminary output the card renders:
//   searching  tags for free text, the search with the trip's signals (the
//              itinerary and the removed places left out), the ask and its
//              places written (keyed by toolCallId);
//   scoring    the advisor's places in the city scored, the ones that fit
//              the ask (category, tags, price cap, area, less known, Michelin,
//              open day) kept and marked "Your place";
//   explaining one grounded sentence per place (lib/agent/explain.ts);
//   weighing   the agent says one honest line per place, one at a time, and
//              names a pick and a backup (lib/agent/weigh.ts). When too few
//              fit it may run one more search into the same card and weigh
//              the new places against its pick.
// Each phase is checkpointed on the ask, so a retried step resumes.
// A locality mismatch comes back as a clear error output, never an empty tab.

export type FindPlacesInput = {
  intent: string;
  category?: SearchCategory;
  tags?: string[];
  price_max?: number;
  area?: string;
  /** The exact circle to search, from the map's "Search this region". Wins over `area`. */
  near?: { lat: number; lon: number; radius_m: number };
  /** Search around this trip place. Loses to `area`. */
  around_place_id?: string;
  /** Search around this trip day when the ask has no slot. `target` already does. */
  around_day?: number;
  /** How far the search may go. Without it the area picks its own radius (search-area.ts). */
  radius_m?: number;
  day_hint?: string;
  /** The itinerary slot this search is for: the ask carries it, the workspace highlights it. */
  target?: { day: number; slot: SlotName };
  /** "less_known": only places below LESS_KNOWN_POPULARITY_MAX. */
  discovery?: "less_known";
  /** Only places Michelin lists. */
  michelin?: boolean;
  take?: number;
};

// Small searches (v3): one slot or one kind of place at a time, a handful of
// candidates, then one recommendation (recommend_place).
export const DEFAULT_TAKE = 5;
export const MIN_TAKE = 3;
export const MAX_TAKE = 8;
/** At most this many of the advisor's own places join a small search beyond its results. */
const MAX_ADVISOR_EXTRAS = 2;
/** How many new places a second search adds to the card. */
const MORE_TAKE = 3;
/** A short beat between two lines, so a fast reply still lands one line at a time. */
const VERDICT_BEAT_MS = 160;
const READING_STATUS = "Reading what people say about each one";

/** The places of a search step as rows to show while the search still runs. */
function previewOf(places: readonly NormalizedPlace[], category: SearchCategory | undefined, take: number, excluded: ReadonlySet<string>): PlacePreview[] {
  return places
    .filter((place) => !excluded.has(place.entityId) && (!category || categoryOf(place) === category))
    .slice(0, take)
    .map((place) => ({
      entityId: place.entityId,
      name: place.name,
      ...(place.images[0]?.url ? { imageUrl: place.images[0].url } : {}),
      ...(place.neighborhood ? { neighborhood: place.neighborhood } : {}),
    }));
}
/** A category search asks for a few more: results of another kind are left out here. */
const CATEGORY_SPARE = 3;
/** Tags beyond this add nothing: a few more words are no reason to fail a search. */
const MAX_TAGS = 4;
const GENERIC_NOUNS: Record<string, SearchCategory> = {
  bar: "drink",
  bars: "drink",
  pub: "drink",
  pubs: "drink",
  restaurant: "eat",
  restaurants: "eat",
  dinner: "eat",
  lunch: "eat",
  breakfast: "eat",
  brunch: "eat",
  cafe: "coffee",
  cafes: "coffee",
  coffee: "coffee",
  museum: "see",
  museums: "see",
  gallery: "see",
  galleries: "see",
  hotel: "stay",
  hotels: "stay",
};
const FILLER = new Set(["places", "place", "spots", "spot", "option", "options", "ideas", "good", "best", "some", "great", "vibe", "vibes", "like", "a", "an", "the", "more"]);

/** The category a slot implies when the ask names none: a meal is a restaurant, the stay a hotel. */
export function slotCategory(slot: SlotName | undefined): SearchCategory | undefined {
  if (slot === "breakfast" || slot === "lunch" || slot === "dinner") return "eat";
  if (slot === "stay") return "stay";
  return undefined;
}

/** The number of places a search asks for: 3 to 8, default 5. */
export function clampTake(take: number | undefined): number {
  return Math.min(MAX_TAKE, Math.max(MIN_TAKE, Math.round(take ?? DEFAULT_TAKE)));
}

/** "natural wine bars" -> { text: "natural wine", category: "drink" }. */
export function splitIntent(intent: string): { text: string; category?: SearchCategory } {
  const words = intent.toLowerCase().split(/\s+/).filter(Boolean);
  let category: SearchCategory | undefined;
  const kept = words.filter((word) => {
    const bare = word.replace(/[^a-z]/g, "");
    if (GENERIC_NOUNS[bare]) {
      category ??= GENERIC_NOUNS[bare];
      return false;
    }
    return !FILLER.has(bare);
  });
  return { text: kept.join(" "), ...(category ? { category } : {}) };
}

/** Tag matches whose name is fully in the text ("Natural Wine" in "natural wine"). */
function namedIn(text: string, name: string): boolean {
  const hay = ` ${text.toLowerCase()} `;
  return name
    .toLowerCase()
    .split(/\s+/)
    .every((word) => hay.includes(` ${word} `) || hay.includes(` ${word}s `));
}

/** A tag for what a place is, not for what it has or what is near it. */
export function isKindTag(tagId: string): boolean {
  return /^urn:tag:(genre|category):place:/.test(tagId);
}

/** "shopping malls" -> "shopping mall". Null when the text does not end in a plural. */
export function singularOf(text: string): string | null {
  return /[^s]s$/i.test(text) ? text.slice(0, -1) : null;
}

/** A kind-of-place tag that is not the asked kind: "boutique" on a hotel ask finds the shop tag. */
export function isOtherKindTag(tagId: string, category: SearchCategory | undefined): boolean {
  if (!category || !tagId.startsWith("urn:tag:category:place:")) return false;
  return categoryOf({ primaryType: null, types: [tagId] }) !== category;
}

/** Free words to tag ids; ids pass through. At most 4 ids. */
async function resolveTags(
  texts: string[],
  category: SearchCategory | undefined,
  ctx: ToolTrip,
  calls: QlooCall[],
): Promise<{ ids: string[]; names: string[] }> {
  const ids: string[] = [];
  const names: string[] = [];
  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("urn:tag:")) {
      ids.push(trimmed);
      continue;
    }
    const matches = async (query: string) => {
      const found = await findTags(query, { tripId: ctx.trip.id });
      calls.push(...found.calls);
      return found.tags.filter((t) => namedIn(trimmed, t.name) && !isOtherKindTag(t.tagId, category));
    };
    // The lookup reads a plural differently: "shopping malls" finds "near
    // shopping malls", "shopping mall" finds what a mall is.
    let tags = await matches(trimmed);
    const singular = singularOf(trimmed);
    if (singular && !tags.some((t) => isKindTag(t.tagId))) {
      const kinds = await matches(singular);
      if (kinds.some((t) => isKindTag(t.tagId))) tags = kinds;
    }
    for (const tag of tags.slice(0, 3)) {
      if (!ids.includes(tag.tagId)) ids.push(tag.tagId);
      if (!names.includes(tag.name)) names.push(tag.name);
    }
  }
  return { ids: ids.slice(0, 4), names };
}

function steps(search: ToolStep, score: ToolStep, explain: ToolStep): ToolStep[] {
  return [search, score, explain];
}

/** The ask's filters, as advisor places admitted into the ask must meet them too. */
export type AskConstraints = {
  /** Tag ids the exact results carry; empty when the search dropped them. */
  tagIds: string[];
  priceMax?: number;
  area?: { lat: number; lon: number; radiusM: number };
  popularityMax?: number;
  michelin?: boolean;
  /** Stored hours that say closed on this day leave a place out. */
  openDay?: Weekday;
  /** So do hours that leave this slot out, on that day. */
  openSlot?: SlotName;
};

/**
 * The filters that held for this ask's own results: the advisor's places
 * admitted into the ask must meet the same ones. A filter the search had to
 * drop (loosened) does not apply to them either, except the open day: a place
 * whose own hours say closed stays out however few places were open.
 */
export function askConstraints(input: AskFilters & {
  tagIds: string[];
  loosened: readonly string[];
  priceMax?: number;
  area?: AskConstraints["area"];
}): AskConstraints {
  const tagsHeld = !input.loosened.includes("tags") && !input.loosened.includes(WIDENED_IN_CATEGORY);
  const priceHeld = !input.loosened.includes("price") && !input.loosened.includes("price_not_applicable");
  return {
    tagIds: tagsHeld ? input.tagIds : [],
    ...(input.priceMax && priceHeld ? { priceMax: input.priceMax } : {}),
    ...(input.area ? { area: input.area } : {}),
    ...(input.popularityMax !== undefined && !input.loosened.includes("popularity") ? { popularityMax: input.popularityMax } : {}),
    ...(input.michelin && !input.loosened.includes("michelin") ? { michelin: true } : {}),
    ...(input.openDay ? { openDay: input.openDay } : {}),
    ...(input.openDay && input.openSlot ? { openSlot: input.openSlot } : {}),
  };
}

/**
 * Does a place meet the ask's filters? An unknown price, position, popularity
 * or set of hours does not count against it. Michelin does: it is a listing,
 * so a place without one is not on the list.
 */
export function meetsAskConstraints(
  place: Pick<NormalizedPlace, "tags" | "priceLevel" | "lat" | "lon"> & Partial<Pick<NormalizedPlace, "properties">>,
  constraints: AskConstraints,
): boolean {
  if (constraints.tagIds.length > 0 && !place.tags.some((t) => constraints.tagIds.includes(t.tagId))) return false;
  if (constraints.priceMax && place.priceLevel != null && place.priceLevel > constraints.priceMax) return false;
  const { popularity, michelin } = placeFactsFromProperties(place.properties);
  if (constraints.popularityMax !== undefined && popularity !== undefined && popularity >= constraints.popularityMax) return false;
  if (constraints.michelin && !michelin) return false;
  if (place.properties?.is_closed === true) return false;
  if (constraints.openDay && closedOn(place.properties?.hours, constraints.openDay)) return false;
  if (constraints.openDay && constraints.openSlot && !openDuring(place.properties?.hours, constraints.openDay, constraints.openSlot)) return false;
  const area = constraints.area;
  if (area && place.lat != null && place.lon != null && haversineM(place.lat, place.lon, area.lat, area.lon) > area.radiusM) {
    return false;
  }
  return true;
}

// What a tool call already did, stored on its ask (trip_asks.checkpoint).
// Workflow retries a failed step from the top; with the checkpoint the retry
// reuses the search's result set and the scoring instead of asking again,
// so the tab never collects the places of two different searches.
const rankedSchema = z.object({
  tripPlaceId: z.string(),
  entityId: z.string(),
  category: z.enum(["eat", "drink", "coffee", "see", "stay", "other"]),
  affinity: z.number().nullable(),
  score: z.number().nullable(),
  explainability: z.array(
    z.object({
      entityId: z.string(),
      name: z.string(),
      share: z.number(),
      tags: z.array(z.string()).optional(),
      feel: z.boolean().optional(),
      media: z.boolean().optional(),
    }),
  ),
});
const stepSchema = z.object({
  key: z.enum(["search", "score", "explain"]),
  label: z.string(),
  detail: z.string().optional(),
  state: z.enum(["pending", "running", "done", "skipped", "failed"]),
  done: z.number().optional(),
  total: z.number().optional(),
  note: z.string().optional(),
});
const checkpointSchema = z.object({
  search: z
    .object({
      ranked: z.array(rankedSchema),
      loosened: z.array(z.string()),
      details: z.string(),
      areaNote: z.string().optional(),
      searchedArea: z.string().optional(),
      note: z.string(),
      constraints: z.object({
        tagIds: z.array(z.string()),
        priceMax: z.number().optional(),
        area: z.object({ lat: z.number(), lon: z.number(), radiusM: z.number() }).optional(),
        popularityMax: z.number().optional(),
        michelin: z.boolean().optional(),
        openDay: z.enum(WEEKDAY_NAMES).optional(),
        openSlot: z.enum(["breakfast", "morning", "lunch", "afternoon", "dinner", "night", "stay"]).optional(),
      }),
    })
    .optional(),
  score: z.object({ ranked: z.array(rankedSchema), step: stepSchema }).optional(),
  explain: z.object({ done: z.number(), total: z.number() }).optional(),
  weigh: z
    .object({
      searches: z.number(),
      verdicts: z.array(
        z.object({
          tripPlaceId: z.string(),
          stand: z.enum(["pick", "backup", "out"]),
          good: z.string(),
          rest: z.string(),
          catch: z.boolean(),
        }),
      ),
    })
    .optional(),
});
export type AskCheckpoint = z.infer<typeof checkpointSchema>;

/** A stored checkpoint, or none when it does not read. */
export function parseCheckpoint(value: unknown): AskCheckpoint {
  const parsed = checkpointSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

/** The cards with no hours on record for `day`: nothing says they are open, whatever got them into the search. */
async function hoursUnknownOn(cards: TripPlaceCard[], day: Weekday): Promise<string[]> {
  if (cards.length === 0) return [];
  const rows = await db
    .select({ id: places.id, properties: places.properties })
    .from(places)
    .where(inArray(places.id, cards.map((c) => c.placeId)));
  const known = new Set(rows.filter((row) => hoursOf(row.properties.hours)?.[day]).map((row) => row.id));
  return cards.filter((c) => !known.has(c.placeId)).map((c) => c.tripPlaceId);
}

async function readCheckpoint(askId: string): Promise<AskCheckpoint> {
  const [row] = await db.select({ checkpoint: tripAsks.checkpoint }).from(tripAsks).where(eq(tripAsks.id, askId)).limit(1);
  return parseCheckpoint(row?.checkpoint);
}

export async function* findPlacesTool(
  input: FindPlacesInput,
  turn: TurnRef,
  toolCallId: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<FindPlacesOutput, FindPlacesOutput> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const ctx = await loadToolTrip(turn.tripId);
  const take = clampTake(input.take);
  const askedTags = input.tags?.slice(0, MAX_TAGS);
  const split = splitIntent(cleanIntent(input.intent, input.day_hint));
  const askCategory: SearchCategory | undefined = input.category ?? split.category ?? slotCategory(input.target?.slot);
  const target: SlotTarget | undefined = input.target
    ? slotTarget(input.target, { startDate: ctx.trip.startDate ?? undefined, destinationName: ctx.destination.name })
    : undefined;
  const openDay = openDayOf({ target: input.target, dayHint: input.day_hint, category: askCategory, trip: ctx.trip });
  // Kept on the ask, so a rerun (remove_place, the UI's replace) stays the same search.
  const filters: AskFilters = {
    ...(input.discovery === "less_known" ? { popularityMax: LESS_KNOWN_POPULARITY_MAX } : {}),
    ...(input.michelin ? { michelin: true } : {}),
    ...(openDay ? { openDay } : {}),
    ...(openDay && input.target ? { openSlot: input.target.slot } : {}),
  };
  const label = askLabel(input.intent, input.near ? MAP_REGION_LABEL : (target?.label ?? input.day_hint));
  // A region on the map is searched as given, in the destination or not.
  const region = input.near ? { lat: input.near.lat, lon: input.near.lon, radiusM: input.near.radius_m } : undefined;
  const searchedPlace = region ? "this region of the map" : ctx.destination.name;
  const terms = searchTerms(askedTags);
  // "see" stays open: it is the nearest fit for a search that really wants a mall.
  const noShopping = askCategory !== undefined && askCategory !== "see";
  const basedOn = basedOnFavorites(ctx.signals.favoritesUsed.map((f) => f.clientName));
  const key = (step: string) => ({ toolCallId, step });

  const askQuery = {
    intent: input.intent,
    ...(askCategory ? { category: askCategory } : {}),
    ...(askedTags?.length ? { tags: askedTags } : {}),
    ...(input.price_max ? { priceMax: input.price_max } : {}),
    ...(input.area ? { area: input.area } : {}),
    ...(region ? { region } : {}),
    ...(input.day_hint ? { day: input.day_hint } : {}),
    // The slot this ask is for (Ask.target): lib/trips reads it back from the query.
    ...(input.target ? { target: { day: input.target.day, slot: input.target.slot } } : {}),
    ...filters,
    take,
  };
  // Keyed by toolCallId: a retried step gets the same ask, and its checkpoint.
  const ask = await guarded(turn, (guard) =>
    createAsk(turn.tripId, { label, toolCallId, status: "running", query: askQuery, target: input.target }, ctx.scope, { turn: guard }),
  );
  const source = `ask:${ask.id}`;
  const checkpoint = await readCheckpoint(ask.id);
  const saveCheckpoint = (next: AskCheckpoint) =>
    guarded(turn, (guard) => updateAsk(ask.id, { checkpoint: next }, ctx.scope, { turn: guard }));

  let searchStep: ToolStep = { key: "search", label: "Search", state: "running" };
  let scoreStep: ToolStep = { key: "score", label: "Score your places", state: "pending" };
  let explainStep: ToolStep = { key: "explain", label: "Explain picks", state: "pending" };
  let cards: TripPlaceCard[] = [];
  let loosened: string[] = [];
  let details = searchDetails({ destination: ctx.destination.name, basedOn });
  let searchedArea: string | undefined;
  let verdicts: PlaceVerdict[] = checkpoint.weigh?.verdicts ?? [];
  let searches = checkpoint.weigh?.searches ?? 1;
  let preview: PlacePreview[] = [];

  const output = (phase: FindPlacesOutput["phase"], extra: Partial<FindPlacesOutput> = {}): FindPlacesOutput => ({
    phase,
    kind: "ask",
    askId: ask.id,
    label,
    title: rowTitle({
      phase: phase === "done" ? "done" : cards.length === 0 ? "pending" : "running",
      count: phase === "done" ? cards.length : Math.max(cards.length, take),
      category: askCategory,
      target,
      dayHint: input.day_hint,
    }),
    details,
    count: cards.length,
    total: cards.length,
    elapsedMs: elapsed(),
    loosened,
    places: cards,
    steps: steps(searchStep, scoreStep, explainStep),
    take,
    noun: categoryNoun(askCategory, 2),
    ...(terms.length ? { terms } : {}),
    ...(target ? { target } : {}),
    ...(searchedArea ? { searchedArea } : {}),
    ...(openDay ? { openDay } : {}),
    ...(ctx.rules.length ? { groundRules: ctx.rules } : {}),
    ...(verdicts.length ? { verdicts } : {}),
    ...(searches > 1 ? { searches } : {}),
    ...(preview.length && cards.length === 0 ? { preview } : {}),
    ...extra,
  });
  const failAsk = () => finishAsk(turn, ask.id, { status: "failed", elapsedMs: elapsed(), loosened: [], resultCount: 0 });
  // The upstream exclusion is trusted but checked, and it never covers the advisor's places.
  const excluded = new Set(ctx.excludeIds);
  const notExcluded = (r: PlaceResult) => !excluded.has(r.place.entityId);

  yield output("searching");

  // Everything after the ask exists runs in here, so a failure at any point
  // (tag lookup included) finishes the ask as failed instead of leaving the
  // tab spinning. A stop ends the generator without reaching the catch; the
  // turn's release finishes the ask then (chat-store.ts releaseTurn).
  try {
    let ranked: RankedPlace[];
    let constraints: AskConstraints;
    let areaNote: string | undefined;
    let logged: Promise<unknown> = Promise.resolve();

    if (checkpoint.search) {
      ranked = checkpoint.search.ranked;
      loosened = checkpoint.search.loosened;
      details = checkpoint.search.details;
      areaNote = checkpoint.search.areaNote;
      searchedArea = checkpoint.search.searchedArea;
      constraints = checkpoint.search.constraints;
      searchStep = { ...searchStep, state: "done", note: checkpoint.search.note };
    } else {
      const calls: QlooCall[] = [];

      // What the advisor named, when it resolves to a place inside the
      // destination, else what the trip already holds (search-area.ts).
      let spot: SearchAreaInput["spot"];
      let missedArea = false;
      if (!region && input.area?.trim()) {
        const found = await resolveLocality(`${input.area}, ${ctx.destination.name}`, { tripId: ctx.trip.id }).catch(() => undefined);
        if (found) calls.push(...found.calls);
        const near = found?.candidates.find(
          (c) => haversineM(c.lat, c.lon, ctx.destination.lat, ctx.destination.lon) <= ctx.destination.radiusM,
        );
        if (near) spot = { lat: near.lat, lon: near.lon, name: near.name };
        else missedArea = true;
      }
      if (!region && !spot && input.around_place_id) spot = await tripPlaceSpot(turn.tripId, input.around_place_id);
      const searchArea = chooseSearchArea({
        destination: ctx.destination,
        placed: region || spot ? [] : await loadPlacedPoints(turn.tripId),
        region,
        spot,
        day: input.around_day ?? input.target?.day,
        forStay: askCategory === "stay",
        radiusM: input.radius_m,
      });
      const destination = { ...ctx.destination, lat: searchArea.lat, lon: searchArea.lon, radiusM: searchArea.radiusM };
      details = searchDetails({ destination: region ? MAP_REGION_LABEL : ctx.destination.name, area: searchArea.near, basedOn });
      if (missedArea) {
        areaNote = `Could not place "${input.area}" on the map, so the search stayed ${searchedAreaText(searchArea, searchArea.radiusM, ctx.destination.name)}.`;
      }

      // Tags: what the advisor asked for in free text, else the category filter.
      const wanted = [...(askedTags ?? []), ...(askedTags?.length ? [] : split.text ? [split.text] : [])];
      const resolved = await resolveTags(wanted, askCategory, ctx, calls);
      const tags = resolved.ids.length > 0 ? resolved.ids : askCategory ? CATEGORY_FILTER_TAGS[askCategory] : [];
      // Kept on the ask so remove_place and the UI's replace can rerun the same search.
      await guarded(turn, (guard) =>
        updateAsk(ask.id, { query: { ...askQuery, resolvedTags: tags, searchArea } }, ctx.scope, { turn: guard }),
      );

      let results: PlaceResult[];
      let reachedM = searchArea.radiusM;
      try {
        // The places show as soon as a search step has checked them; the rest of
        // the steps, the writes and the cards catch up behind them.
        const searching = withProgress<PlacePreview[], FindPlacesResult>((report) =>
          findPlaces(
            {
              destination,
              widen: searchArea.widen,
              signals: ctx.signals.signals,
              ...(tags.length ? { tags, tagsOperator: "union" as const } : {}),
              ...(input.price_max ? { priceMax: input.price_max } : {}),
              noShopping,
              ...filters,
              ...(ctx.excludeIds.length ? { excludeIds: ctx.excludeIds } : {}),
              take: askCategory ? take + CATEGORY_SPARE : take,
              onStage: (stage) => report(previewOf(stage, askCategory, take, excluded)),
            },
            { tripId: ctx.trip.id },
          ),
        );
        let step = await searching.next();
        while (!step.done) {
          preview = step.value;
          if (preview.length > 0) yield output("searching");
          step = await searching.next();
        }
        const found = step.value;
        calls.push(...found.calls);
        loosened = found.loosened;
        results = found.results.filter(notExcluded);
        reachedM = found.radiusM;
      } catch (error) {
        await logCalls(turn, ctx, calls, source, key("search"));
        if (error instanceof QlooLocalityMismatchError) {
          await failAsk();
          searchStep = { ...searchStep, state: "failed" };
          scoreStep = { ...scoreStep, state: "skipped" };
          explainStep = { ...explainStep, state: "skipped" };
          return output("done", {
            error: region
              ? "No places came back for this region of the map. Move the map or zoom out, then search again."
              : `The search returned places in ${error.resolved}, not in ${ctx.destination.name}. Nothing was added. Try again, or check the trip's destination.`,
          });
        }
        if (abortSignal?.aborted) throw error;
        throw new FatalError("The place search did not answer. Try the search again in a moment.");
      }
      // Few exact matches for the advisor's words: the search dropped every tag.
      // Fill the rest from the asked category instead (exact matches first),
      // so "natural wine bars" never turns into restaurants and cafes.
      const otherKind = results.some((r) => r.category !== askCategory);
      if (resolved.ids.length > 0 && askCategory && (loosened.includes("tags") || otherKind)) {
        const exact = results.filter(
          (r) => r.category === askCategory && r.place.tags.some((t) => resolved.ids.includes(t.tagId)),
        );
        const room = take - exact.length;
        if (room > 0) {
          const fillExcludeIds = searchExclusions(exact.map((r) => r.place.entityId), ctx.excludeIds);
          try {
            const fill = await findPlaces(
              {
                destination,
                widen: searchArea.widen,
                signals: ctx.signals.signals,
                tags: CATEGORY_FILTER_TAGS[askCategory],
                tagsOperator: "union",
                ...(input.price_max ? { priceMax: input.price_max } : {}),
                ...filters,
                ...(fillExcludeIds.length ? { excludeIds: fillExcludeIds } : {}),
                noShopping,
                take: Math.min(45, room + 4),
              },
              { tripId: ctx.trip.id },
            );
            calls.push(...fill.calls);
            const fillers = fill.results.filter(notExcluded).filter((r) => r.category === askCategory).slice(0, room);
            if (fillers.length > 0) {
              reachedM = Math.max(reachedM, fill.radiusM);
              const merged = [...exact, ...fillers];
              const affinities = merged.flatMap((r) => r.affinity ?? []);
              results = merged.map((r) => ({ ...r, score: r.affinity === null ? null : displayScore(r.affinity, affinities) }));
              // Only what the kept places needed: a fill can try more than its best places did.
              loosened = [...new Set([...merged.flatMap((r) => r.loosened ?? []).filter((l) => l !== "tags"), WIDENED_IN_CATEGORY])];
            }
          } catch (error) {
            if (abortSignal?.aborted) throw error;
            // Keep the loosened results of the first search.
          }
        }
      }
      // Written next to the places, not before them: nobody waits on the log.
      logged = logCalls(turn, ctx, calls, source, key("search"), loosened).catch((error: unknown) => error);

      // Category re-check: only the asked kind, unless nothing else came back
      // (the search has then said what it dropped). The category filter is loose
      // upstream: a cafe with a restaurant tag is not a dinner.
      const ofKind = askCategory ? results.filter((r) => r.category === askCategory) : results;
      const kept = (ofKind.length > 0 ? ofKind : results).slice(0, take);
      if (kept.length < results.length) {
        const keptAffinities = kept.flatMap((r) => r.affinity ?? []);
        results = kept.map((r) => ({ ...r, score: r.affinity === null ? null : displayScore(r.affinity, keptAffinities) }));
      }
      const applied = new Set<string>(results.flatMap((r) => r.loosened ?? []));
      loosened = loosened.filter((l) => l === "price_not_applicable" || l === WIDENED_IN_CATEGORY || applied.has(l));
      const items: BoardItem[] = results.map((r) => ({
        place: r.place,
        category: r.category,
        affinity: r.affinity,
        score: r.score,
        signalScores: r.signalScores,
        source: "ask",
      }));
      const ids = await persistBoardItems(turn, ctx, items);
      ranked = items.flatMap((item) => {
        const tripPlaceId = ids.get(item.place.entityId);
        return tripPlaceId ? [rankedOf(ctx, tripPlaceId, item)] : [];
      });
      await persistAskPlaces(turn, ctx, ask.id, ranked);
      constraints = askConstraints({
        tagIds: resolved.ids,
        loosened,
        priceMax: input.price_max,
        area: { lat: searchArea.lat, lon: searchArea.lon, radiusM: reachedM },
        ...filters,
      });
      searchedArea = region ? undefined : searchedAreaText(searchArea, reachedM, ctx.destination.name);
      areaNote = [areaNote, widenedNote(searchArea, reachedM)].filter(Boolean).join(" ") || undefined;
      const note = `${ranked.length} found · ${seconds(elapsed())}`;
      searchStep = { ...searchStep, state: "done", note };
      checkpoint.search = {
        ranked,
        loosened,
        details,
        ...(areaNote ? { areaNote } : {}),
        ...(searchedArea ? { searchedArea } : {}),
        note,
        constraints,
      };
      await saveCheckpoint(checkpoint);
    }
    cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));

    if (cards.length === 0) {
      await finishAsk(turn, ask.id, { status: "done", elapsedMs: elapsed(), loosened, resultCount: 0 });
      scoreStep = { ...scoreStep, state: "skipped" };
      explainStep = { ...explainStep, state: "skipped" };
      return output("done", { error: `No places matched in ${searchedPlace}. Try a broader ask.` });
    }

    yield output("scoring", { status: READING_STATUS });
    const logFailure = await logged;
    if (logFailure) throw logFailure;

    // Score the advisor's places in the city; keep the ones that fit the ask.
    const cityName = ctx.destination.name;
    const client = firstName(ctx.clientName);
    if (checkpoint.score) {
      ranked = checkpoint.score.ranked;
      scoreStep = checkpoint.score.step;
      cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));
    } else if (ctx.advisorPlaces.length === 0) {
      scoreStep = { ...scoreStep, state: "skipped", detail: `No saved places in ${cityName} yet` };
    } else {
      scoreStep = {
        ...scoreStep,
        state: "running",
        detail: `Your ${ctx.advisorPlaces.length} ${cityName} places, scored for ${client}`,
        total: ctx.advisorPlaces.length,
      };
      yield output("scoring", { status: READING_STATUS });
      const scoreStarted = Date.now();
      try {
        const { scores, calls: scoreCalls } = await scoreAdvisorPlaces(
          ctx,
          ranked.flatMap((r) => r.affinity ?? []),
        );
        await logCalls(turn, ctx, scoreCalls, source, key("score"));
        const inResults = new Set(ranked.map((r) => r.entityId));
        const fitCategory: Category | undefined = askCategory ?? ranked[0]?.category;
        // An advisor place joins the ask only when it fits the ask's own
        // filters (category, tags, price cap, area); in-result ones already do.
        const kept = scores.filter(
          (s) =>
            !excluded.has(s.item.place.entityId) &&
            (inResults.has(s.item.place.entityId) ||
              (s.item.category === fitCategory && meetsAskConstraints(s.item.place, constraints))),
        );
        // In-result advisor places already carry the link (persistBoardItems);
        // the others join the board and the ask, ranked by affinity.
        // A small search keeps its size: the best few of them only.
        const extra = kept
          .filter((s) => !inResults.has(s.item.place.entityId))
          .map((s) => s.item)
          .sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0))
          .slice(0, MAX_ADVISOR_EXTRAS);
        const extraIds = await persistBoardItems(turn, ctx, extra);
        ranked = [
          ...ranked,
          ...extra.flatMap((item) => {
            const tripPlaceId = extraIds.get(item.place.entityId);
            return tripPlaceId ? [rankedOf(ctx, tripPlaceId, item)] : [];
          }),
        ].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
        await persistAskPlaces(turn, ctx, ask.id, ranked);
        cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));
        scoreStep = {
          ...scoreStep,
          state: "done",
          done: ctx.advisorPlaces.length,
          detail: `Your ${ctx.advisorPlaces.length} ${cityName} places, scored for ${client}${kept.length ? "" : " · none fit this ask"}`,
          note: `${kept.length} kept · ${seconds(Date.now() - scoreStarted)}`,
        };
        checkpoint.score = { ranked, step: scoreStep };
        await saveCheckpoint(checkpoint);
      } catch (error) {
        if (abortSignal?.aborted || error instanceof TurnSupersededError) throw error;
        console.error(`[find_places ${toolCallId}] scoring your places failed`, error);
        scoreStep = { ...scoreStep, state: "failed", note: "Could not score" };
      }
    }

    // Explain the picks, next to the weighing rather than before it: both are
    // model calls, and neither needs the other's answer.
    let explained = 0;
    let toExplain = cards.filter((c) => !c.reason).length;
    let explainFailure: unknown;
    const explaining = async () => {
      try {
        const { reasons, drivers } = await explainCards(turn, ctx, cards, abortSignal);
        explained = reasons.size;
        // The tags reach the ask's rows and the checkpoint too, so a retried step
        // keeps them. Not a whole result set: the cards are on screen, and a place
        // replaced while the model ran stays in the tab.
        ranked = ranked.map((r) => ({ ...r, explainability: carryTags(r.explainability, drivers.get(r.tripPlaceId)) }));
        await persistAskPlaces(turn, ctx, ask.id, ranked, { replace: false });
        if (checkpoint.score) checkpoint.score = { ...checkpoint.score, ranked };
        else if (checkpoint.search) checkpoint.search = { ...checkpoint.search, ranked };
        checkpoint.explain = { done: explained, total: toExplain };
        await saveCheckpoint(checkpoint);
      } catch (error) {
        if (abortSignal?.aborted || error instanceof TurnSupersededError) explainFailure = error;
        else console.error(`[find_places ${toolCallId}] explaining failed`, error);
      }
    };
    let explainRun: Promise<void> = Promise.resolve();
    if (checkpoint.explain) {
      explained = checkpoint.explain.done;
      toExplain = checkpoint.explain.total;
    } else {
      explainStep = {
        ...explainStep,
        state: "running",
        detail: `Reading which of ${client}'s favorites drive each pick`,
        done: 0,
        total: toExplain,
        note: `0 of ${toExplain}`,
      };
      yield output("explaining", { done: 0, total: toExplain, status: READING_STATUS });
      explainRun = explaining();
    }
    const explainSettled = async () => {
      await explainRun;
      if (explainFailure) throw explainFailure;
    };

    // The agent weighs the candidates out loud. No taste to judge by, or nothing
    // to choose between: the search keeps its own order and the agent picks.
    if (!checkpoint.weigh && cards.length > 1 && ctx.signals.signals.length > 0) {
      const modelOptions = { modelRef: agentModelRef(), providerOptions: agentProviderOptions(turn.chatId), abortSignal };
      const toWeigh = (list: TripPlaceCard[]): WeighPlace[] =>
        list.map((c) => ({
          tripPlaceId: c.tripPlaceId,
          name: c.name,
          category: c.category,
          sharedTags: c.sharedTags.map((t) => t.name),
          facts: factsForModel(c),
        }));
      const brief: Omit<WeighBrief, "maySearchAgain" | "current"> = {
        clientName: client,
        brief: [input.intent, ...(askedTags ?? [])].join(", "),
        ...(target ? { forSlot: target.label } : {}),
        taste: ctx.tasteTags.slice(0, 12).map((t) => t.name),
        rules: ctx.rules,
        favorites: ctx.signals.favorites.map((f) => f.name),
      };
      try {
        yield output("weighing", { status: READING_STATUS });
        // Each line shows the moment the model has written it.
        const firstPass = weighPlaces(toWeigh(cards), { ...brief, maySearchAgain: true }, modelOptions);
        let told = await firstPass.next();
        while (!told.done) {
          verdicts = [...verdicts, told.value];
          yield output("weighing", { status: READING_STATUS });
          await pause(VERDICT_BEAT_MS, abortSignal);
          told = await firstPass.next();
        }
        const first = told.value;
        verdicts = settleVerdicts(verdicts, first.verdicts);
        yield output("weighing", { status: READING_STATUS });
        // Before anything else writes the ask's rows: the reasons carry their tags there.
        await explainSettled();

        if (first.more) {
          const more: MoreSearch = first.more;
          yield output("weighing", { status: more.why });
          const area = constraints.area;
          const calls: QlooCall[] = [];
          const wanted = more.tags.length ? more.tags : [more.intent];
          const resolved = await resolveTags(wanted, askCategory, ctx, calls);
          const seen = ranked.map((r) => r.entityId);
          const found = await findPlaces(
            {
              destination: area ? { ...ctx.destination, lat: area.lat, lon: area.lon, radiusM: area.radiusM } : ctx.destination,
              signals: ctx.signals.signals,
              ...(resolved.ids.length ? { tags: resolved.ids, tagsOperator: "union" as const } : askCategory ? { tags: CATEGORY_FILTER_TAGS[askCategory], tagsOperator: "union" as const } : {}),
              ...(input.price_max ? { priceMax: input.price_max } : {}),
              noShopping,
              ...filters,
              ...(more.lessKnown ? { popularityMax: LESS_KNOWN_POPULARITY_MAX } : {}),
              excludeIds: searchExclusions(seen, ctx.excludeIds),
              take: MORE_TAKE + CATEGORY_SPARE,
            },
            { tripId: ctx.trip.id },
          );
          calls.push(...found.calls);
          await logCalls(turn, ctx, calls, source, key("more"));
          const fresh = found.results
            .filter(notExcluded)
            .filter((r) => !seen.includes(r.place.entityId) && (!askCategory || r.category === askCategory))
            .slice(0, MORE_TAKE);
          if (fresh.length > 0) {
            const items: BoardItem[] = fresh.map((r) => ({
              place: r.place,
              category: r.category,
              affinity: r.affinity,
              score: r.score,
              signalScores: r.signalScores,
              source: "ask",
            }));
            const ids = await persistBoardItems(turn, ctx, items);
            ranked = [
              ...ranked,
              ...items.flatMap((item) => {
                const tripPlaceId = ids.get(item.place.entityId);
                return tripPlaceId ? [rankedOf(ctx, tripPlaceId, item)] : [];
              }),
            ];
            await persistAskPlaces(turn, ctx, ask.id, ranked);
            const known = new Set(cards.map((c) => c.tripPlaceId));
            cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));
            const added = cards.filter((c) => !known.has(c.tripPlaceId));
            searches = 2;
            yield output("weighing", { status: more.why });
            if (added.length > 0) {
              await explainCards(turn, ctx, added, abortSignal);
              cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));
              const fresher = cards.filter((c) => !known.has(c.tripPlaceId));
              const leader = verdicts.find((v) => v.stand === "pick");
              const leaderName = cards.find((c) => c.tripPlaceId === leader?.tripPlaceId)?.name;
              const status = leaderName ? `Weighing them against ${leaderName}` : READING_STATUS;
              yield output("weighing", { status });
              const before = verdicts;
              const secondPass = weighPlaces(
                toWeigh(fresher),
                {
                  ...brief,
                  maySearchAgain: false,
                  ...(leader && leaderName ? { current: { name: leaderName, line: `${leader.good} ${leader.rest}`.trim() } } : {}),
                },
                modelOptions,
              );
              let toldNext = await secondPass.next();
              while (!toldNext.done) {
                verdicts = mergeVerdicts(verdicts, [toldNext.value], { keepPick: true });
                yield output("weighing", { status });
                await pause(VERDICT_BEAT_MS, abortSignal);
                toldNext = await secondPass.next();
              }
              // Only a pick the model names over the place to beat replaces it.
              const second = toldNext.value;
              verdicts = mergeVerdicts(before, second.verdicts, { keepPick: !second.overtakes });
            }
          }
        }

        // The agent's order is now the order: the pick never reads below a place it beat.
        ranked = dealScores(verdictOrder(ranked, verdicts));
        await persistAskPlaces(turn, ctx, ask.id, ranked);
        await writeScores(turn, ranked.flatMap((r) => (r.score === null ? [] : [{ tripPlaceId: r.tripPlaceId, score: r.score }])));
        const [stored] = await db.select({ query: tripAsks.query }).from(tripAsks).where(eq(tripAsks.id, ask.id)).limit(1);
        await guarded(turn, (guard) => updateAsk(ask.id, { query: { ...stored?.query, verdicts } }, ctx.scope, { turn: guard }));
        if (checkpoint.score) checkpoint.score = { ...checkpoint.score, ranked };
        else if (checkpoint.search) checkpoint.search = { ...checkpoint.search, ranked };
        checkpoint.weigh = { searches, verdicts };
        await saveCheckpoint(checkpoint);
      } catch (error) {
        if (abortSignal?.aborted || error instanceof TurnSupersededError) throw error;
        // A failed second search keeps what the first pass said.
        console.error(`[find_places ${toolCallId}] weighing failed`, error);
      }
    }

    await explainSettled();
    cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));
    explainStep = {
      ...explainStep,
      state: "done",
      detail: `Reading which of ${client}'s favorites drive each pick`,
      done: explained,
      total: toExplain,
      note: `${explained} of ${toExplain}`,
    };

    const hoursUnknown = openDay ? await hoursUnknownOn(cards, openDay) : [];
    await assertTurn(turn);
    await finishAsk(turn, ask.id, { status: "done", elapsedMs: elapsed(), loosened, resultCount: cards.length });
    return output("done", {
      done: explained,
      total: cards.length,
      ...(areaNote ? { progress: areaNote } : {}),
      ...(hoursUnknown.length ? { hoursUnknown } : {}),
    });
  } catch (error) {
    // The lock is gone (stopped or replaced): the release finishes the ask.
    if (!(error instanceof TurnSupersededError)) await failAsk().catch(() => false);
    throw error;
  }
}
