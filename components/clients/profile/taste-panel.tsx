"use client";

import { useEffect, useRef, useState } from "react";

import {
  addFavoriteAction,
  addUnmatchedFavoriteAction,
  recomputeTasteTagsAction,
  removeFavoriteAction,
  reorderFavoritesAction,
  resolveFavoriteAction,
  setGroundRulesAction,
  setMediaFavoritesAction,
} from "@/lib/clients/actions";
import { addMedia, toMediaFavorite, unmatchedCandidates, type FavoriteTile, type MediaKind } from "@/lib/clients/candidates";
import type { FavoriteCandidate, MediaFavorite, TasteTag } from "@/lib/contracts";

import { isMatched, matchedCount, moveItem, removeById, upsertById } from "../favorites";
import { AddPlaceTile } from "./add-place-tile";
import { AlsoInto } from "./also-into";
import { MatchedTile, UnmatchedTile } from "./favorite-tiles";
import { GroundRules } from "./ground-rules";
import { TasteTags } from "./taste-tags";
import type { TypedCandidate } from "./use-entity-search";
import type { RunOp } from "./use-save-tracker";

// The right panel of the profile: places they love (add, match, reorder,
// remove), artists and films, the taste tags recomputed after every
// favorites change, and the ground rules. Every change shows at once and
// saves through a server action; a failure puts the list back and the
// header names the problem.

const TASTE_DEBOUNCE_MS = 1200;

type Near = { lat: number; lon: number } | null;

export function TastePanel({
  clientId,
  homeCity,
  near,
  initialFavorites,
  initialMedia,
  initialRules,
  initialTags,
  runOp,
  onMatchedChange,
}: {
  clientId: string | null;
  homeCity: string;
  near: Near;
  initialFavorites: FavoriteTile[];
  initialMedia: MediaFavorite[];
  initialRules: string[];
  initialTags: TasteTag[];
  runOp: RunOp;
  onMatchedChange: (matched: number) => void;
}) {
  const [favorites, setFavorites] = useState(initialFavorites);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [media, setMedia] = useState(initialMedia);
  const [rules, setRules] = useState(initialRules);
  const [tags, setTags] = useState(initialTags);
  const [tagsUpdating, setTagsUpdating] = useState(false);
  const tmpCounter = useRef(0);
  const tasteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tasteRun = useRef(0);

  const matched = matchedCount(favorites);
  useEffect(() => onMatchedChange(matched), [matched, onMatchedChange]);
  useEffect(() => () => {
    if (tasteTimer.current) clearTimeout(tasteTimer.current);
  }, []);

  function markPending(id: string, on: boolean) {
    setPending((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function scheduleTaste() {
    if (!clientId) return;
    if (tasteTimer.current) clearTimeout(tasteTimer.current);
    setTagsUpdating(true);
    tasteTimer.current = setTimeout(async () => {
      const run = ++tasteRun.current;
      const result = await recomputeTasteTagsAction(clientId).catch(() => null);
      if (run !== tasteRun.current) return;
      setTagsUpdating(false);
      if (result?.ok) setTags(result.data);
    }, TASTE_DEBOUNCE_MS);
  }

  /** Shows `tile` at once under a temporary id, then swaps in the saved row or takes it back. */
  async function addOptimistic(tile: Omit<FavoriteTile, "id">, save: () => ReturnType<typeof addFavoriteAction>) {
    const tmp = `tmp-${++tmpCounter.current}`;
    setFavorites((list) => [...list, { ...tile, id: tmp }]);
    markPending(tmp, true);
    const out: { tile?: FavoriteTile } = {};
    const ok = await runOp("favorites", async () => {
      const result = await save();
      if (result.ok) out.tile = result.data;
      return result;
    });
    markPending(tmp, false);
    setFavorites((list) => (out.tile ? upsertById(list, out.tile, tmp) : removeById(list, tmp)));
    if (ok) scheduleTaste();
  }

  function addPicked(candidate: TypedCandidate, query: string) {
    if (!clientId) return;
    const text = query || candidate.name;
    void addOptimistic(
      { query: text, match: "resolved", name: candidate.name, city: null, imageUrl: candidate.imageUrl ?? null, candidates: [] },
      () => addFavoriteAction(clientId, { query: text, entityId: candidate.entityId, near }),
    );
  }

  function addTyped(query: string, results: TypedCandidate[]) {
    if (!clientId) return;
    void addOptimistic(
      { query, match: "unmatched", name: query, city: null, imageUrl: null, candidates: unmatchedCandidates(results) },
      () => addUnmatchedFavoriteAction(clientId, { query, near }),
    );
  }

  async function resolve(favorite: FavoriteTile, candidate: FavoriteCandidate) {
    const before = favorite;
    setFavorites((list) =>
      upsertById(list, { ...favorite, match: "resolved", name: candidate.name, imageUrl: candidate.imageUrl ?? null, city: null }),
    );
    markPending(favorite.id, true);
    const out: { tile?: FavoriteTile } = {};
    const ok = await runOp("favorites", async () => {
      const result = await resolveFavoriteAction(favorite.id, { query: favorite.query, entityId: candidate.entityId, near });
      if (result.ok) out.tile = result.data;
      return result;
    });
    markPending(favorite.id, false);
    setFavorites((list) => upsertById(list, out.tile ?? before));
    if (ok) scheduleTaste();
  }

  async function remove(favorite: FavoriteTile) {
    const index = favorites.findIndex((f) => f.id === favorite.id);
    setFavorites((list) => removeById(list, favorite.id));
    const ok = await runOp("favorites", () => removeFavoriteAction(favorite.id));
    if (!ok) {
      setFavorites((list) => {
        const next = [...list];
        next.splice(Math.min(index, next.length), 0, favorite);
        return next;
      });
      return;
    }
    if (isMatched(favorite)) scheduleTaste();
  }

  async function move(from: number, to: number) {
    if (!clientId || from === to) return;
    const before = favorites;
    const next = moveItem(favorites, from, to);
    setFavorites(next);
    const ids = next.filter((f) => !f.id.startsWith("tmp-")).map((f) => f.id);
    const ok = await runOp("favorites", () => reorderFavoritesAction(clientId, ids));
    if (!ok) setFavorites(before);
  }

  async function saveMedia(next: MediaFavorite[]) {
    if (!clientId) return;
    const before = media;
    setMedia(next);
    const ok = await runOp("media", () => setMediaFavoritesAction(clientId, next));
    if (!ok) setMedia(before);
  }

  async function saveRules(next: string[]) {
    if (!clientId) return;
    const before = rules;
    setRules(next);
    const ok = await runOp("rules", () => setGroundRulesAction(clientId, next));
    if (!ok) setRules(before);
  }

  const disabledReason = clientId ? null : "Add a name first";
  const placesLabel = homeCity.trim() ? `Places they love · ${homeCity.trim()}` : "Places they love";

  return (
    <section aria-labelledby="taste-title" className="flex min-w-0 grow flex-col gap-[22px] self-start rounded-sheet bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 id="taste-title" className="font-display text-[28px] leading-[34px] text-ink">
          Taste profile
        </h2>
        <p className="text-ui leading-5 text-text-muted">
          {favorites.length === 0
            ? "Add the places they love. Each one is matched to a real place, so every trip starts from their taste."
            : "Saved once, used for every new trip. Each favorite is matched to a real place."}
        </p>
      </div>

      <section aria-labelledby="places-they-love" className="flex flex-col gap-3">
        <h3 id="places-they-love" className="label-caps leading-4 text-text-muted">
          {placesLabel}
        </h3>
        <ul className="relative flex flex-wrap gap-3">
          {favorites.map((favorite, index) => {
            const moves = { index, count: favorites.length, onMove: move };
            const isPending = pending.has(favorite.id) || favorite.id.startsWith("tmp-");
            return isMatched(favorite) ? (
              <MatchedTile
                key={favorite.id}
                favorite={favorite}
                homeCity={homeCity}
                pending={isPending}
                moves={moves}
                onRemove={() => void remove(favorite)}
              />
            ) : (
              <UnmatchedTile
                key={favorite.id}
                favorite={favorite}
                pending={isPending}
                moves={moves}
                onResolve={(candidate) => void resolve(favorite, candidate)}
                onRemove={() => void remove(favorite)}
              />
            );
          })}
          <AddPlaceTile near={near} disabledReason={disabledReason} onPick={addPicked} onSubmitText={addTyped} />
        </ul>
      </section>

      <AlsoInto
        media={media}
        disabled={!clientId}
        onAdd={(candidate: TypedCandidate, kind: MediaKind, query: string) =>
          void saveMedia(addMedia(media, toMediaFavorite(candidate, kind, query)))
        }
        onRemove={(index) => void saveMedia(media.filter((_, i) => i !== index))}
      />

      <TasteTags tags={tags} matched={matched} updating={tagsUpdating} />

      <GroundRules rules={rules} disabled={!clientId} onChange={(next) => void saveRules(next)} />
    </section>
  );
}
