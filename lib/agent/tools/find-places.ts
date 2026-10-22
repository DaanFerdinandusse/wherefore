import "server-only";

import { FatalError } from "workflow";

import type { Category, FindPlacesOutput, ToolStep, TripPlaceCard } from "@/lib/contracts";
import { createAsk, updateAsk } from "@/lib/trips";
import {
  CATEGORY_FILTER_TAGS,
  displayScore,
  findPlaces,
  findTags,
  haversineM,
  QlooLocalityMismatchError,
  resolveLocality,
  type PlaceResult,
  type QlooCall,
} from "@/lib/qloo";

import { assertTurn, finishAsk, guarded, type TurnRef } from "../writes";

import {
  askLabel,
  basedOnFavorites,
  cleanIntent,
  searchDetails,
  searchTitle,
  seconds,
  WIDENED_IN_CATEGORY,
  type SearchCategory,
} from "./labels";
import {
  cardsInOrder,
  explainCards,
  persistAskPlaces,
  persistBoardItems,
  scoreAdvisorPlaces,
  type BoardItem,
} from "./search-core";
import { firstName, loadToolTrip, logCalls, type ToolTrip } from "./trip-data";

// find_places (PLAN 7): one ask from the advisor becomes one board and map
// tab. Three phases, each yielded as a preliminary output the card renders:
//   searching  tags for free text, the search with the trip's signals, the
//              ask and its places written (keyed by toolCallId);
//   scoring    the advisor's places in the city scored, the ones that fit
//              the ask kept and marked "Your place";
//   explaining one grounded sentence per place (lib/agent/explain.ts).
// A locality mismatch comes back as a clear error output, never an empty tab.

export type FindPlacesInput = {
  intent: string;
  category?: SearchCategory;
  tags?: string[];
  price_max?: number;
  area?: string;
  day_hint?: string;
  take?: number;
};

const DEFAULT_TAKE = 12;
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

export async function* findPlacesTool(
  input: FindPlacesInput,
  turn: TurnRef,
  toolCallId: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<FindPlacesOutput, FindPlacesOutput> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const ctx = await loadToolTrip(turn.tripId);
  const take = Math.min(20, Math.max(8, Math.round(input.take ?? DEFAULT_TAKE)));
  const label = askLabel(input.intent, input.day_hint);
  const split = splitIntent(cleanIntent(input.intent, input.day_hint));
  const askCategory: SearchCategory | undefined = input.category ?? split.category;
  const basedOn = basedOnFavorites(ctx.signals.favoritesUsed.map((f) => f.clientName));
  const calls: QlooCall[] = [];

  const askQuery = {
    intent: input.intent,
    ...(askCategory ? { category: askCategory } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.price_max ? { priceMax: input.price_max } : {}),
    ...(input.area ? { area: input.area } : {}),
    ...(input.day_hint ? { day: input.day_hint } : {}),
    take,
  };
  const ask = await guarded(turn, () =>
    createAsk(turn.tripId, { label, toolCallId, status: "running", query: askQuery }, ctx.scope),
  );
  const source = `ask:${ask.id}`;

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
    title: searchTitle(input.intent, phase !== "done", input.day_hint),
    details,
    count: cards.length,
    total: cards.length,
    elapsedMs: elapsed(),
    loosened,
    places: cards,
    steps: steps(searchStep, scoreStep, explainStep),
    ...extra,
  });

  yield output("searching");

  // The area, only when it resolves to a place inside the destination.
  let destination = ctx.destination;
  let areaNote: string | undefined;
  if (input.area?.trim()) {
    const found = await resolveLocality(`${input.area}, ${ctx.destination.name}`, { tripId: ctx.trip.id }).catch(() => undefined);
    if (found) calls.push(...found.calls);
    const near = found?.candidates.find(
      (c) => haversineM(c.lat, c.lon, ctx.destination.lat, ctx.destination.lon) <= ctx.destination.radiusM,
    );
    if (near) {
      destination = { ...ctx.destination, lat: near.lat, lon: near.lon, radiusM: AREA_RADIUS_M };
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
  await guarded(turn, () => updateAsk(ask.id, { query: { ...askQuery, resolvedTags: tags } }, ctx.scope));

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
    await logCalls(turn, ctx, calls, source);
    if (error instanceof QlooLocalityMismatchError) {
      await finishAsk(turn, ask.id, { status: "failed", elapsedMs: elapsed(), loosened: [], resultCount: 0 });
      searchStep = { ...searchStep, state: "failed" };
      scoreStep = { ...scoreStep, state: "skipped" };
      explainStep = { ...explainStep, state: "skipped" };
      return output("done", {
        error: `The search returned places in ${error.resolved}, not in ${ctx.destination.name}. Nothing was added. Try again, or check the trip's destination.`,
      });
    }
    await finishAsk(turn, ask.id, { status: "failed", elapsedMs: elapsed(), loosened: [], resultCount: 0 });
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
  await logCalls(turn, ctx, calls.splice(0), source, loosened);

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
  let ranked = items.flatMap((item) => {
    const tripPlaceId = ids.get(item.place.entityId);
    return tripPlaceId ? [{ tripPlaceId, item }] : [];
  });
  await persistAskPlaces(turn, ctx, ask.id, ranked);
  cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));
  searchStep = { ...searchStep, state: "done", note: `${cards.length} found · ${seconds(elapsed())}` };

  if (cards.length === 0) {
    await finishAsk(turn, ask.id, { status: "done", elapsedMs: elapsed(), loosened, resultCount: 0 });
    scoreStep = { ...scoreStep, state: "skipped" };
    explainStep = { ...explainStep, state: "skipped" };
    return output("done", { error: `No places matched in ${ctx.destination.name}. Try a broader ask.` });
  }

  // Score the advisor's places in the city; keep the ones that fit the ask.
  const cityName = ctx.destination.name;
  const client = firstName(ctx.clientName);
  if (ctx.advisorPlaces.length === 0) {
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
        results.map((r) => r.affinity),
      );
      await logCalls(turn, ctx, scoreCalls, source);
      const inResults = new Set(results.map((r) => r.place.entityId));
      const fitCategory: Category | undefined = askCategory ?? results[0]?.category;
      const kept = scores.filter((s) => inResults.has(s.item.place.entityId) || s.item.category === fitCategory);
      // In-result advisor places already carry the link (persistBoardItems);
      // the others join the board and the ask, ranked by score.
      const extra = kept.filter((s) => !inResults.has(s.item.place.entityId)).map((s) => s.item);
      const extraIds = await persistBoardItems(turn, ctx, extra);
      const merged = [
        ...ranked,
        ...extra.flatMap((item) => {
          const tripPlaceId = extraIds.get(item.place.entityId);
          return tripPlaceId ? [{ tripPlaceId, item }] : [];
        }),
      ].sort((a, b) => b.item.affinity - a.item.affinity);
      ranked = merged;
      await persistAskPlaces(turn, ctx, ask.id, ranked);
      cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));
      scoreStep = {
        ...scoreStep,
        state: "done",
        done: ctx.advisorPlaces.length,
        detail: `Your ${ctx.advisorPlaces.length} ${cityName} places, scored for ${client}${kept.length ? "" : " · none fit this ask"}`,
        note: `${kept.length} kept · ${seconds(Date.now() - scoreStarted)}`,
      };
    } catch (error) {
      if (abortSignal?.aborted) throw error;
      console.error(`[find_places ${toolCallId}] scoring your places failed`, error);
      scoreStep = { ...scoreStep, state: "failed", note: "Could not score" };
    }
  }

  // Explain the picks.
  const toExplain = cards.filter((c) => !c.reason).length;
  explainStep = {
    ...explainStep,
    state: "running",
    detail: `Reading which of ${client}'s favorites drive each pick`,
    done: 0,
    total: toExplain,
    note: `0 of ${toExplain}`,
  };
  yield output("explaining", { done: 0, total: toExplain });
  let explained = 0;
  try {
    explained = (await explainCards(turn, ctx, cards, abortSignal)).size;
  } catch (error) {
    if (abortSignal?.aborted) throw error;
    console.error(`[find_places ${toolCallId}] explaining failed`, error);
  }
  cards = await cardsInOrder(ctx, ranked.map((r) => r.tripPlaceId));
  explainStep = {
    ...explainStep,
    state: "done",
    done: explained,
    note: `${explained} of ${toExplain}`,
  };

  await assertTurn(turn);
  await finishAsk(turn, ask.id, { status: "done", elapsedMs: elapsed(), loosened, resultCount: cards.length });
  return output("done", {
    done: explained,
    total: cards.length,
    ...(areaNote ? { progress: areaNote } : {}),
  });
}
