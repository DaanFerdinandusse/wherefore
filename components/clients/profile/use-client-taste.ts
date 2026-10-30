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
import type { TypedCandidate } from "./use-entity-search";
import type { RunOp } from "./use-save-tracker";

// The client's taste as profile state: places they love (add, match,
// reorder, remove), artists and films, the taste tags recomputed after every
// favorites change, and the ground rules. Every change shows at once and
// saves through a server action; a failure puts the list back and the
// header names the problem.

const TASTE_DEBOUNCE_MS = 1200;

type Near = { lat: number; lon: number } | null;

export type ClientTaste = ReturnType<typeof useClientTaste>;

export function useClientTaste({
  clientId,
  near,
  initialFavorites,
  initialMedia,
  initialRules,
  initialTags,
  runOp,
}: {
  clientId: string;
  near: Near;
  initialFavorites: FavoriteTile[];
  initialMedia: MediaFavorite[];
  initialRules: string[];
  initialTags: TasteTag[];
  runOp: RunOp;
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

  function addPlace(candidate: TypedCandidate, query: string) {
    if (favorites.some((favorite) => favorite.entityId === candidate.entityId)) return;
    const text = query || candidate.name;
    void addOptimistic(
      {
        query: text,
        entityId: candidate.entityId,
        match: "resolved",
        name: candidate.name,
        city: null,
        imageUrl: candidate.imageUrl ?? null,
        primaryType: null,
        candidates: [],
      },
      () => addFavoriteAction(clientId, { query: text, entityId: candidate.entityId, near }),
    );
  }

  function addTyped(query: string, results: TypedCandidate[]) {
    void addOptimistic(
      {
        query,
        entityId: null,
        match: "unmatched",
        name: query,
        city: null,
        imageUrl: null,
        primaryType: null,
        candidates: unmatchedCandidates(results.filter((r) => r.type === "place")),
      },
      () => addUnmatchedFavoriteAction(clientId, { query, near }),
    );
  }

  async function resolve(favorite: FavoriteTile, candidate: FavoriteCandidate) {
    const before = favorite;
    setFavorites((list) =>
      upsertById(list, { ...favorite, entityId: candidate.entityId, match: "resolved", name: candidate.name, imageUrl: candidate.imageUrl ?? null, city: null }),
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
    if (from === to) return;
    const before = favorites;
    const next = moveItem(favorites, from, to);
    setFavorites(next);
    const ids = next.filter((f) => !f.id.startsWith("tmp-")).map((f) => f.id);
    const ok = await runOp("favorites", () => reorderFavoritesAction(clientId, ids));
    if (!ok) setFavorites(before);
  }

  async function saveMedia(next: MediaFavorite[]) {
    const before = media;
    setMedia(next);
    const ok = await runOp("media", () => setMediaFavoritesAction(clientId, next));
    if (!ok) setMedia(before);
  }

  function addMediaPick(candidate: TypedCandidate, kind: MediaKind, query: string) {
    void saveMedia(addMedia(media, toMediaFavorite(candidate, kind, query)));
  }

  function removeMedia(index: number) {
    void saveMedia(media.filter((_, i) => i !== index));
  }

  async function saveRules(next: string[]) {
    const before = rules;
    setRules(next);
    const ok = await runOp("rules", () => setGroundRulesAction(clientId, next));
    if (!ok) setRules(before);
  }

  return {
    favorites,
    pending,
    media,
    rules,
    tags,
    tagsUpdating,
    matched: matchedCount(favorites),
    addPlace,
    addTyped,
    resolve: (favorite: FavoriteTile, candidate: FavoriteCandidate) => void resolve(favorite, candidate),
    remove: (favorite: FavoriteTile) => void remove(favorite),
    move: (from: number, to: number) => void move(from, to),
    addMedia: addMediaPick,
    removeMedia,
    saveRules: (next: string[]) => void saveRules(next),
  };
}
