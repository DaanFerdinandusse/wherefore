import "server-only";

import { FatalError } from "workflow";

import { setTasteTags } from "@/lib/clients";
import { upsertTripPlaces } from "@/lib/trips";
import type { BuiltFrom, FindPlacesOutput, SeedSummary, ToolStep, TripPlaceCard } from "@/lib/contracts";
import {
  CATEGORY_FILTER_TAGS,
  categoryOf,
  findPlaces,
  QlooLocalityMismatchError,
  tastePortrait,
  type PlaceResult,
} from "@/lib/qloo";

import { assertTurn, cacheWrite, guarded, markSeedFailed, writeSeedState, type TurnRef } from "../writes";

import { categoryCounts, runCategoryLoop, type CategoryLoopState } from "./category-loop";
import { basedOnFavorites, CATEGORY_PHRASE, searchDetails, SEED_CATEGORIES, seconds } from "./labels";
import {
  cardsInOrder,
  explainCards,
  persistBoardItems,
  scoreAdvisorPlaces,
  type BoardItem,
} from "./search-core";
import { firstName, loadToolTrip, logCalls, type CallKey, type ToolTrip } from "./trip-data";

// seed_trip (PLAN 8): the first turn's deterministic setup, no model inside
// except the explain step. Five category searches in sequence fill the board
// category by category (each yields its places), the advisor's own places in
// the city are scored and kept with their score even when weak, reasons are
// written, and the summary goes back to the model for the first message.

export const SEED_TAKE = 8;
const TASTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EXPLAINED = 40;

function isStale(at: Date | null | undefined, now = Date.now()): boolean {
  return !at || now - at.getTime() > TASTE_MAX_AGE_MS;
}

/** Suggestions for what the advisor could ask next, from facts only. */
export function askNextFor(input: {
  companionsWithoutFavorites: string[];
  datesExact: boolean;
  emptyCategories: string[];
  advisorPlaceCount: number;
}): string[] {
  const next: string[] = [];
  for (const name of input.companionsWithoutFavorites.slice(0, 2)) {
    next.push(`Add a few favorites for ${name} so their taste counts too`);
  }
  if (input.emptyCategories.length > 0) next.push(`Search ${input.emptyCategories.join(" and ")} with a more specific ask`);
  next.push(input.datesExact ? "Ask for a plan for the first evening" : "Set the trip dates to plan by day");
  if (input.advisorPlaceCount === 0) next.push("Save a few of your own places in this city to see how they score");
  return next.slice(0, 3);
}

export async function* seedTripTool(
  turn: TurnRef,
  toolCallId: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<FindPlacesOutput, FindPlacesOutput> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const ctx = await loadToolTrip(turn.tripId);
  let finished = false;
  try {
    const out = yield* seed(ctx, turn, toolCallId, elapsed, abortSignal);
    finished = true;
    return out;
  } catch (error) {
    if (abortSignal?.aborted || error instanceof FatalError) throw error;
    console.error(`[seed_trip ${turn.tripId}] failed`, error);
    throw new FatalError("Could not build the first list. Send it again to retry.");
  } finally {
    // Also runs when Stop ends the generator at a yield (generator.return()
    // skips the catch): a seed that did not reach done never stays "running".
    if (!finished) await markSeedFailed(turn).catch(() => false);
  }
}

async function* seed(
  ctx: ToolTrip,
  turn: TurnRef,
  toolCallId: string,
  elapsed: () => number,
  abortSignal?: AbortSignal,
): AsyncGenerator<FindPlacesOutput, FindPlacesOutput> {
  const key = (step: string): CallKey => ({ toolCallId, step });
  await writeSeedState(turn, { seedStatus: "running" });
  const client = firstName(ctx.clientName);
  const basedOn = basedOnFavorites(ctx.signals.favoritesUsed.map((f) => f.clientName));
  const details = searchDetails({ destination: ctx.destination.name, basedOn });

  let searchStep: ToolStep = { key: "search", label: "Search", state: "running", done: 0, total: SEED_CATEGORIES.length };
  let scoreStep: ToolStep = { key: "score", label: "Score your places", state: "pending" };
  let explainStep: ToolStep = { key: "explain", label: "Explain picks", state: "pending" };
  const order: string[] = [];
  let cards: TripPlaceCard[] = [];

  const output = (phase: FindPlacesOutput["phase"], extra: Partial<FindPlacesOutput> = {}): FindPlacesOutput => ({
    phase,
    kind: "seed",
    label: "First list",
    title: phase === "done" ? `Built the first list for ${client}` : `Building the first list for ${client}`,
    details,
    count: cards.length,
    total: cards.length,
    elapsedMs: elapsed(),
    loosened: [],
    places: cards,
    steps: [searchStep, scoreStep, explainStep],
    ...extra,
  });

  if (ctx.signals.signals.length === 0) {
    throw new FatalError(
      `${ctx.clientName} has no favorites that resolved to a place yet. Add a few favorites on the client profile, then retry.`,
    );
  }

  yield output("searching", { progress: `Searching ${CATEGORY_PHRASE.eat} · 1 of ${SEED_CATEGORIES.length}` });

  // The client's taste tags, refreshed when older than a week.
  const ownSignals = ctx.signals.favorites
    .filter((f) => ctx.signals.favoritesUsed.some((u) => u.clientName === ctx.clientName && u.names.includes(f.name)))
    .map((f) => f.entityId);
  if (ctx.client && ownSignals.length > 0 && isStale(ctx.client.tasteTagsAt)) {
    try {
      const portrait = await tastePortrait(ownSignals, { tripId: ctx.trip.id });
      await logCalls(turn, ctx, portrait.calls, "seed", key("portrait"));
      if (portrait.tags.length > 0) {
        await cacheWrite(turn, () => setTasteTags(ctx.clientId, portrait.tags, ctx.scope));
        const known = new Set(portrait.tags.map((t) => t.name.toLowerCase()));
        ctx.tasteTags = [...portrait.tags, ...ctx.tasteTags.filter((t) => !known.has(t.name.toLowerCase()))];
      }
    } catch (error) {
      if (abortSignal?.aborted) throw error;
      console.error(`[seed_trip ${turn.tripId}] taste tags refresh failed`, error);
    }
  }

  // Five searches, one per category, in sequence.
  let mismatch: QlooLocalityMismatchError | undefined;
  const loop = runCategoryLoop<PlaceResult>(
    SEED_CATEGORIES,
    async (category) => {
      try {
        const found = await findPlaces(
          {
            destination: ctx.destination,
            signals: ctx.signals.signals,
            tags: CATEGORY_FILTER_TAGS[category],
            tagsOperator: "union",
            take: SEED_TAKE,
          },
          { tripId: ctx.trip.id },
        );
        await logCalls(turn, ctx, found.calls, "seed", key(`search:${category}`), found.loosened);
        return { results: found.results, loosened: found.loosened };
      } catch (error) {
        if (error instanceof QlooLocalityMismatchError) mismatch = error;
        throw error;
      }
    },
    SEED_TAKE,
  );

  let state: CategoryLoopState<PlaceResult> | undefined;
  while (true) {
    if (abortSignal?.aborted) throw abortSignal.reason ?? new DOMException("Stopped", "AbortError");
    const next = await loop.next();
    if (next.done) {
      state = next.value;
      break;
    }
    const { added, index, total } = next.value;
    const items: BoardItem[] = added.map((r) => ({
      place: r.place,
      category: r.category,
      affinity: r.affinity,
      score: r.score,
      signalScores: r.signalScores,
      source: "seed",
    }));
    const ids = await persistBoardItems(turn, ctx, items);
    for (const item of items) {
      const id = ids.get(item.place.entityId);
      if (id && !order.includes(id)) order.push(id);
    }
    cards = await cardsInOrder(ctx, order);
    searchStep = { ...searchStep, done: index };
    const upcoming = SEED_CATEGORIES[index];
    yield output("searching", {
      progress: upcoming ? `Searching ${CATEGORY_PHRASE[upcoming]} · ${index + 1} of ${total}` : `Searched ${total} of ${total} categories`,
    });
  }

  const failed = Object.keys(state.failed);
  if (order.length === 0) {
    if (mismatch) {
      throw new FatalError(
        `The search returned places in ${mismatch.resolved}, not in ${ctx.destination.name}. Check the trip's destination, then retry.`,
      );
    }
    throw new FatalError("The place search did not answer for any category. Send it again to retry.");
  }
  searchStep = {
    ...searchStep,
    state: failed.length > 0 ? "failed" : "done",
    note: `${order.length} found · ${seconds(elapsed())}`,
  };

  // The advisor's places in the city, scored for the client, kept even when weak.
  const advisorSummary: SeedSummary["advisorPlaces"] = [];
  if (ctx.advisorPlaces.length === 0) {
    scoreStep = { ...scoreStep, state: "skipped", detail: `No saved places in ${ctx.destination.name} yet` };
  } else {
    scoreStep = {
      ...scoreStep,
      state: "running",
      detail: `Your ${ctx.advisorPlaces.length} ${ctx.destination.name} places, scored for ${client}`,
      total: ctx.advisorPlaces.length,
    };
    yield output("scoring", { progress: "Scoring your places" });
    const scoreStarted = Date.now();
    try {
      const seedAffinities = Object.values(state.byCategory).flatMap((list) => list.flatMap((r) => r.affinity ?? []));
      const { scores, calls } = await scoreAdvisorPlaces(ctx, seedAffinities);
      await logCalls(turn, ctx, calls, "seed", key("score"));
      const ids = await persistBoardItems(turn, ctx, scores.map((s) => s.item));
      for (const s of scores) {
        const id = ids.get(s.item.place.entityId);
        if (id && !order.includes(id)) order.push(id);
      }
      // The upstream does not score every place for every set of favorites.
      // Those still join the board as "Your place", with no score.
      const scoredIds = new Set(scores.map((s) => s.item.place.entityId));
      const unscored = ctx.advisorPlaces.filter((p) => !scoredIds.has(p.entityId));
      if (unscored.length > 0) {
        const unscoredIds = await guarded(turn, (guard) =>
          upsertTripPlaces(
            turn.tripId,
            unscored.map((p) => ({
              placeId: p.placeId,
              source: "advisor" as const,
              category: categoryOf({ primaryType: p.primaryType, types: [] }),
              advisorPlaceId: p.id,
            })),
            ctx.scope,
            { turn: guard },
          ),
        );
        for (const p of unscored) {
          const id = unscoredIds[p.placeId];
          if (id && !order.includes(id)) order.push(id);
        }
      }
      for (const saved of ctx.advisorPlaces) {
        const s = scores.find((x) => x.item.place.entityId === saved.entityId);
        advisorSummary.push({ name: saved.name, ...(typeof s?.item.score === "number" ? { score: s.item.score } : {}), onBoard: true });
      }
      cards = await cardsInOrder(ctx, order);
      scoreStep = {
        ...scoreStep,
        state: "done",
        done: scores.length,
        note: `${scores.length} kept · ${seconds(Date.now() - scoreStarted)}`,
      };
    } catch (error) {
      if (abortSignal?.aborted) throw error;
      console.error(`[seed_trip ${turn.tripId}] scoring your places failed`, error);
      for (const saved of ctx.advisorPlaces) advisorSummary.push({ name: saved.name, onBoard: false });
      scoreStep = { ...scoreStep, state: "failed", note: "Could not score" };
    }
  }

  // One grounded sentence per place.
  const toExplain = cards.filter((c) => !c.reason).slice(0, MAX_EXPLAINED);
  explainStep = {
    ...explainStep,
    state: "running",
    detail: `Reading which of ${client}'s favorites drive each pick`,
    done: 0,
    total: toExplain.length,
    note: `0 of ${toExplain.length}`,
  };
  yield output("explaining", { done: 0, total: toExplain.length, progress: "Explaining picks" });
  let explained = 0;
  try {
    explained = (await explainCards(turn, ctx, toExplain, abortSignal)).reasons.size;
  } catch (error) {
    if (abortSignal?.aborted) throw error;
    console.error(`[seed_trip ${turn.tripId}] explaining failed`, error);
  }
  cards = await cardsInOrder(ctx, order);
  explainStep = { ...explainStep, state: "done", done: explained, note: `${explained} of ${toExplain.length}` };

  const builtFrom: BuiltFrom = {
    favorites: ctx.signals.favoritesUsed,
    advisorPlaceCount: ctx.advisorPlaces.length,
    companionsWithoutFavorites: ctx.signals.companionsWithoutFavorites,
    rules: ctx.rules,
  };
  await assertTurn(turn);
  await writeSeedState(turn, { seedStatus: "done", builtFrom });

  const counts = categoryCounts({ ...state, byCategory: { eat: [], drink: [], coffee: [], see: [], stay: [] } }, cards);
  const summary: SeedSummary = {
    clientName: ctx.clientName,
    destination: ctx.destination.name,
    total: cards.length,
    categories: counts,
    favoritesUsed: ctx.signals.favoritesUsed,
    advisorPlaces: advisorSummary,
    companionsWithoutFavorites: ctx.signals.companionsWithoutFavorites,
    rules: ctx.rules,
    explained,
    askNext: askNextFor({
      companionsWithoutFavorites: ctx.signals.companionsWithoutFavorites,
      datesExact: ctx.trip.datesMode === "exact" && Boolean(ctx.trip.startDate),
      emptyCategories: counts.filter((c) => c.count === 0 && c.category !== "other").map((c) => CATEGORY_PHRASE[c.category]),
      advisorPlaceCount: ctx.advisorPlaces.length,
    }),
  };
  return output("done", {
    summary,
    done: explained,
    ...(failed.length > 0 ? { progress: `Could not search ${failed.map((c) => CATEGORY_PHRASE[c as keyof typeof CATEGORY_PHRASE]).join(", ")}.` } : {}),
  });
}
