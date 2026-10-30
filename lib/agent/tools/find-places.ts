import "server-only";

import { eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { z } from "zod";

import type { Category, FindPlacesOutput, SlotName, SlotTarget, ToolStep, TripPlaceCard } from "@/lib/contracts";
import { db } from "@/lib/db";
import { tripAsks } from "@/lib/db/schema";
import { createAsk, updateAsk } from "@/lib/trips";
import {
  CATEGORY_FILTER_TAGS,
  displayScore,
  findPlaces,
  findTags,
  haversineM,
  QlooLocalityMismatchError,
  resolveLocality,
  type NormalizedPlace,
  type PlaceResult,
  type QlooCall,
} from "@/lib/qloo";

import { assertTurn, finishAsk, guarded, TurnSupersededError, type TurnRef } from "../writes";

import {
  askLabel,
  basedOnFavorites,
  categoryNoun,
  cleanIntent,
  rowTitle,
  searchDetails,
  searchTerms,
  seconds,
  slotTarget,
  WIDENED_IN_CATEGORY,
  type SearchCategory,
} from "./labels";
import {
  cardsInOrder,
  explainCards,
  persistAskPlaces,
  persistBoardItems,
  rankedOf,
  scoreAdvisorPlaces,
  type BoardItem,
  type RankedPlace,
} from "./search-core";
import { firstName, loadToolTrip, logCalls, type ToolTrip } from "./trip-data";

// find_places (PLAN 7): one ask from the advisor becomes one board and map
// tab. Three phases, each yielded as a preliminary output the card renders:
//   searching  tags for free text, the search with the trip's signals, the
//              ask and its places written (keyed by toolCallId);
//   scoring    the advisor's places in the city scored, the ones that fit
//              the ask (category, tags, price cap, area) kept and marked
//              "Your place";
//   explaining one grounded sentence per place (lib/agent/explain.ts).
// Each phase is checkpointed on the ask, so a retried step resumes.
// A locality mismatch comes back as a clear error output, never an empty tab.

export type FindPlacesInput = {
  intent: string;
  category?: SearchCategory;
  tags?: string[];
  price_max?: number;
  area?: string;
  day_hint?: string;
  /** The itinerary slot this search is for: the ask carries it, the workspace highlights it. */
  target?: { day: number; slot: SlotName };
  take?: number;
};

// Small searches (v3): one slot or one kind of place at a time, a handful of
// candidates, then one recommendation (recommend_place).
export const DEFAULT_TAKE = 5;
export const MIN_TAKE = 3;
export const MAX_TAKE = 8;
/** At most this many of the advisor's own places join a small search beyond its results. */
const MAX_ADVISOR_EXTRAS = 2;
const AREA_RADIUS_M = 1_500;
const GENERIC_NOUNS: Record<string, SearchCategory> = {
  bar: "drink",
  bars: "drink",
  pub: "drink",
  pubs: "drink",
  restaurant: "eat",
  restaurants: "eat",
  dinner: "eat",
  lunch: "eat",
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
const FILLER = new Set(["places", "place", "spots", "spot", "options", "ideas", "good", "best", "some", "great"]);

/** The category a slot implies when the ask names none: a meal is a restaurant, the stay a hotel. */
export function slotCategory(slot: SlotName | undefined): SearchCategory | undefined {
  if (slot === "lunch" || slot === "dinner") return "eat";
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

/** Free words to tag ids; ids pass through. At most 4 ids. */
async function resolveTags(
  texts: string[],
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
    const found = await findTags(trimmed, { tripId: ctx.trip.id });
    calls.push(...found.calls);
    for (const tag of found.tags.filter((t) => namedIn(trimmed, t.name)).slice(0, 3)) {
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
};

/**
 * The filters that held for this ask's own results: the advisor's places
 * admitted into the ask must meet the same ones. A filter the search had to
 * drop (loosened) does not apply to them either.
 */
export function askConstraints(input: {
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
  };
}

/** Does a place meet the ask's filters? An unknown price or position does not count against it. */
export function meetsAskConstraints(
  place: Pick<NormalizedPlace, "tags" | "priceLevel" | "lat" | "lon">,
  constraints: AskConstraints,
): boolean {
  if (constraints.tagIds.length > 0 && !place.tags.some((t) => constraints.tagIds.includes(t.tagId))) return false;
  if (constraints.priceMax && place.priceLevel != null && place.priceLevel > constraints.priceMax) return false;
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
  affinity: z.number(),
  score: z.number(),
  explainability: z.array(z.object({ entityId: z.string(), name: z.string(), share: z.number() })),
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
      note: z.string(),
      constraints: z.object({
        tagIds: z.array(z.string()),
        priceMax: z.number().optional(),
        area: z.object({ lat: z.number(), lon: z.number(), radiusM: z.number() }).optional(),
      }),
    })
    .optional(),
  score: z.object({ ranked: z.array(rankedSchema), step: stepSchema }).optional(),
  explain: z.object({ done: z.number(), total: z.number() }).optional(),
});
export type AskCheckpoint = z.infer<typeof checkpointSchema>;

async function readCheckpoint(askId: string): Promise<AskCheckpoint> {
  const [row] = await db.select({ checkpoint: tripAsks.checkpoint }).from(tripAsks).where(eq(tripAsks.id, askId)).limit(1);
  const parsed = checkpointSchema.safeParse(row?.checkpoint ?? {});
  return parsed.success ? parsed.data : {};
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
  const split = splitIntent(cleanIntent(input.intent, input.day_hint));
  const askCategory: SearchCategory | undefined = input.category ?? split.category ?? slotCategory(input.target?.slot);
  const target: SlotTarget | undefined = input.target
    ? slotTarget(input.target, { startDate: ctx.trip.startDate ?? undefined, destinationName: ctx.destination.name })
    : undefined;
  const label = askLabel(input.intent, target?.label ?? input.day_hint);
  const terms = searchTerms(input.tags, split.text);
  const basedOn = basedOnFavorites(ctx.signals.favoritesUsed.map((f) => f.clientName));
  const key = (step: string) => ({ toolCallId, step });

  const askQuery = {
    intent: input.intent,
    ...(askCategory ? { category: askCategory } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.price_max ? { priceMax: input.price_max } : {}),
    ...(input.area ? { area: input.area } : {}),
    ...(input.day_hint ? { day: input.day_hint } : {}),
    // The slot this ask is for (Ask.target): lib/trips reads it back from the query.
    ...(input.target ? { target: { day: input.target.day, slot: input.target.slot } } : {}),
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
    ...extra,
  });
  const failAsk = () => finishAsk(turn, ask.id, { status: "failed", elapsedMs: elapsed(), loosened: [], resultCount: 0 });

  yield output("searching");

  // Everything after the ask exists runs in here, so a failure at any point
  // (tag lookup included) finishes the ask as failed instead of leaving the
  // tab spinning. A stop ends the generator without reaching the catch; the
  // turn's release finishes the ask then (chat-store.ts releaseTurn).
  try {
    let ranked: RankedPlace[];
    let constraints: AskConstraints;
    let areaNote: string | undefined;

    if (checkpoint.search) {
      ranked = checkpoint.search.ranked;
      loosened = checkpoint.search.loosened;
      details = checkpoint.search.details;
      areaNote = checkpoint.search.areaNote;
      constraints = checkpoint.search.constraints;
      searchStep = { ...searchStep, state: "done", note: checkpoint.search.note };
    } else {
      const calls: QlooCall[] = [];

      // The area, only when it resolves to a place inside the destination.
      let destination = ctx.destination;
      let area: AskConstraints["area"];
      if (input.area?.trim()) {
        const found = await resolveLocality(`${input.area}, ${ctx.destination.name}`, { tripId: ctx.trip.id }).catch(() => undefined);
        if (found) calls.push(...found.calls);
        const near = found?.candidates.find(
          (c) => haversineM(c.lat, c.lon, ctx.destination.lat, ctx.destination.lon) <= ctx.destination.radiusM,
        );
        if (near) {
          destination = { ...ctx.destination, lat: near.lat, lon: near.lon, radiusM: AREA_RADIUS_M };
          area = { lat: near.lat, lon: near.lon, radiusM: AREA_RADIUS_M };
          details = searchDetails({ destination: ctx.destination.name, area: near.name, basedOn });
        } else {
          areaNote = `Could not place "${input.area}" on the map, so the search covers all of ${ctx.destination.name}.`;
        }
      }

      // Tags: what the advisor asked for in free text, else the category filter.
      const wanted = [...(input.tags ?? []), ...(input.tags?.length ? [] : split.text ? [split.text] : [])];
      const resolved = await resolveTags(wanted, ctx, calls);
      const tags = resolved.ids.length > 0 ? resolved.ids : askCategory ? CATEGORY_FILTER_TAGS[askCategory] : [];
      // Kept on the ask so remove_place can rerun the same search.
      await guarded(turn, (guard) =>
        updateAsk(ask.id, { query: { ...askQuery, resolvedTags: tags } }, ctx.scope, { turn: guard }),
      );

      let results: PlaceResult[];
      try {
        const found = await findPlaces(
          {
            destination,
            signals: ctx.signals.signals,
            ...(tags.length ? { tags, tagsOperator: "union" as const } : {}),
            ...(input.price_max ? { priceMax: input.price_max } : {}),
            take,
          },
          { tripId: ctx.trip.id },
        );
        calls.push(...found.calls);
        loosened = found.loosened;
        results = found.results;
      } catch (error) {
        await logCalls(turn, ctx, calls, source, key("search"));
        if (error instanceof QlooLocalityMismatchError) {
          await failAsk();
          searchStep = { ...searchStep, state: "failed" };
          scoreStep = { ...scoreStep, state: "skipped" };
          explainStep = { ...explainStep, state: "skipped" };
          return output("done", {
            error: `The search returned places in ${error.resolved}, not in ${ctx.destination.name}. Nothing was added. Try again, or check the trip's destination.`,
          });
        }
        if (abortSignal?.aborted) throw error;
        throw new FatalError("The place search did not answer. Try the search again in a moment.");
      }
      // Few exact matches for the advisor's words: the search dropped every tag.
      // Fill the rest from the asked category instead (exact matches first),
      // so "natural wine bars" never turns into restaurants and cafes.
      if (resolved.ids.length > 0 && askCategory && loosened.includes("tags")) {
        const exact = results.filter((r) => r.place.tags.some((t) => resolved.ids.includes(t.tagId)));
        const room = take - exact.length;
        if (room > 0) {
          try {
            const fill = await findPlaces(
              {
                destination,
                signals: ctx.signals.signals,
                tags: CATEGORY_FILTER_TAGS[askCategory],
                tagsOperator: "union",
                ...(input.price_max ? { priceMax: input.price_max } : {}),
                ...(exact.length ? { excludeIds: exact.map((r) => r.place.entityId) } : {}),
                take: Math.min(50, room + 4),
              },
              { tripId: ctx.trip.id },
            );
            calls.push(...fill.calls);
            const fillers = fill.results.filter((r) => r.category === askCategory).slice(0, room);
            if (fillers.length > 0) {
              const merged = [...exact, ...fillers];
              const affinities = merged.map((r) => r.affinity);
              results = merged.map((r) => ({ ...r, score: displayScore(r.affinity, affinities) }));
              loosened = [
                ...new Set([
                  ...loosened.filter((l) => l !== "tags"),
                  ...fill.loosened.filter((l) => l !== "tags"),
                  WIDENED_IN_CATEGORY,
                ]),
              ];
            }
          } catch (error) {
            if (abortSignal?.aborted) throw error;
            // Keep the loosened results of the first search.
          }
        }
      }
      await logCalls(turn, ctx, calls, source, key("search"), loosened);

      // Category re-check: results of the asked category first.
      if (askCategory) {
        results = [...results.filter((r) => r.category === askCategory), ...results.filter((r) => r.category !== askCategory)];
      }
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
      constraints = askConstraints({ tagIds: resolved.ids, loosened, priceMax: input.price_max, area });
      const note = `${ranked.length} found · ${seconds(elapsed())}`;
      searchStep = { ...searchStep, state: "done", note };
      checkpoint.search = { ranked, loosened, details, ...(areaNote ? { areaNote } : {}), note, constraints };
      await saveCheckpoint(checkpoint);
    }
    cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));

    if (cards.length === 0) {
      await finishAsk(turn, ask.id, { status: "done", elapsedMs: elapsed(), loosened, resultCount: 0 });
      scoreStep = { ...scoreStep, state: "skipped" };
      explainStep = { ...explainStep, state: "skipped" };
      return output("done", { error: `No places matched in ${ctx.destination.name}. Try a broader ask.` });
    }

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
      yield output("scoring");
      const scoreStarted = Date.now();
      try {
        const { scores, calls: scoreCalls } = await scoreAdvisorPlaces(
          ctx,
          ranked.map((r) => r.affinity),
        );
        await logCalls(turn, ctx, scoreCalls, source, key("score"));
        const inResults = new Set(ranked.map((r) => r.entityId));
        const fitCategory: Category | undefined = askCategory ?? ranked[0]?.category;
        // An advisor place joins the ask only when it fits the ask's own
        // filters (category, tags, price cap, area); in-result ones already do.
        const kept = scores.filter(
          (s) =>
            inResults.has(s.item.place.entityId) ||
            (s.item.category === fitCategory && meetsAskConstraints(s.item.place, constraints)),
        );
        // In-result advisor places already carry the link (persistBoardItems);
        // the others join the board and the ask, ranked by affinity.
        // A small search keeps its size: the best few of them only.
        const extra = kept
          .filter((s) => !inResults.has(s.item.place.entityId))
          .map((s) => s.item)
          .sort((a, b) => b.affinity - a.affinity)
          .slice(0, MAX_ADVISOR_EXTRAS);
        const extraIds = await persistBoardItems(turn, ctx, extra);
        ranked = [
          ...ranked,
          ...extra.flatMap((item) => {
            const tripPlaceId = extraIds.get(item.place.entityId);
            return tripPlaceId ? [rankedOf(ctx, tripPlaceId, item)] : [];
          }),
        ].sort((a, b) => b.affinity - a.affinity);
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

    // Explain the picks.
    let explained = 0;
    let toExplain = cards.filter((c) => !c.reason).length;
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
      yield output("explaining", { done: 0, total: toExplain });
      try {
        explained = (await explainCards(turn, ctx, cards, abortSignal)).size;
        checkpoint.explain = { done: explained, total: toExplain };
        await saveCheckpoint(checkpoint);
      } catch (error) {
        if (abortSignal?.aborted || error instanceof TurnSupersededError) throw error;
        console.error(`[find_places ${toolCallId}] explaining failed`, error);
      }
    }
    cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));
    explainStep = {
      ...explainStep,
      state: "done",
      detail: `Reading which of ${client}'s favorites drive each pick`,
      done: explained,
      total: toExplain,
      note: `${explained} of ${toExplain}`,
    };

    await assertTurn(turn);
    await finishAsk(turn, ask.id, { status: "done", elapsedMs: elapsed(), loosened, resultCount: cards.length });
    return output("done", {
      done: explained,
      total: cards.length,
      ...(areaNote ? { progress: areaNote } : {}),
    });
  } catch (error) {
    // The lock is gone (stopped or replaced): the release finishes the ask.
    if (!(error instanceof TurnSupersededError)) await failAsk().catch(() => false);
    throw error;
  }
}
