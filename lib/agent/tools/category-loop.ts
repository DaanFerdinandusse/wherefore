import type { Category } from "@/lib/contracts";

import type { SearchCategory } from "./labels";

// The seed's category loop (PLAN 8 step 3): one search per board category,
// sequential (parallel calls run into upstream rate limits), each result
// re-checked with its real category because the category filters are loose
// (restaurants come back under cocktail_bar). Pure: the search itself is
// injected, so the loop is tested without a network.
//
// Re-check rule: a result lands in its real category, not the one searched.
// A result whose real category is another board category fills that one (up
// to `take`); "other" results are dropped. An entity lands once.

export type LoopResult = { place: { entityId: string }; category: Category };

export type CategorySearch<R extends LoopResult> = (
  category: SearchCategory,
) => Promise<{ results: R[]; loosened: string[] }>;

export type CategoryLoopState<R extends LoopResult> = {
  byCategory: Record<SearchCategory, R[]>;
  loosened: Partial<Record<SearchCategory, string[]>>;
  failed: Partial<Record<SearchCategory, string>>;
};

export type CategoryLoopProgress<R extends LoopResult> = {
  category: SearchCategory;
  /** 1-based position of `category` in the loop. */
  index: number;
  total: number;
  /** Results this search added, in their real categories. */
  added: R[];
  state: CategoryLoopState<R>;
};

export function emptyLoopState<R extends LoopResult>(): CategoryLoopState<R> {
  return { byCategory: { eat: [], drink: [], coffee: [], see: [], stay: [] }, loosened: {}, failed: {} };
}

function isSearchCategory(category: Category): category is SearchCategory {
  return category !== "other";
}

/**
 * Puts one search's results into the state (mutates it). Returns what was
 * added. Results arrive best first, so earlier results win a full category.
 */
export function assignResults<R extends LoopResult>(state: CategoryLoopState<R>, results: R[], take: number): R[] {
  const seen = new Set(Object.values(state.byCategory).flatMap((list) => list.map((r) => r.place.entityId)));
  const added: R[] = [];
  for (const result of results) {
    if (!isSearchCategory(result.category)) continue;
    if (seen.has(result.place.entityId)) continue;
    const list = state.byCategory[result.category];
    if (list.length >= take) continue;
    seen.add(result.place.entityId);
    list.push(result);
    added.push(result);
  }
  return added;
}

/**
 * Runs the searches in order and yields after each one. A failed search is
 * recorded in `failed` and the loop goes on, so one bad category never
 * leaves the board empty. Returns the final state.
 */
export async function* runCategoryLoop<R extends LoopResult>(
  categories: readonly SearchCategory[],
  search: CategorySearch<R>,
  take: number,
): AsyncGenerator<CategoryLoopProgress<R>, CategoryLoopState<R>> {
  const state = emptyLoopState<R>();
  for (let i = 0; i < categories.length; i++) {
    const category = categories[i] as SearchCategory;
    let added: R[] = [];
    try {
      const { results, loosened } = await search(category);
      if (loosened.length > 0) state.loosened[category] = loosened;
      added = assignResults(state, results, take);
    } catch (error) {
      state.failed[category] = error instanceof Error ? error.message : String(error);
    }
    yield { category, index: i + 1, total: categories.length, added, state };
  }
  return state;
}

/** Counts per category, board order, empty ones included. */
export function categoryCounts<R extends LoopResult>(
  state: CategoryLoopState<R>,
  extra: { category: Category }[] = [],
): { category: Category; count: number }[] {
  const counts = new Map<Category, number>();
  for (const [category, list] of Object.entries(state.byCategory) as [SearchCategory, R[]][]) {
    counts.set(category, list.length);
  }
  for (const item of extra) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts.entries()].map(([category, count]) => ({ category, count }));
}
